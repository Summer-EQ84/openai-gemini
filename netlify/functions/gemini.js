// netlify/functions/gemini.js
/*
 * OpenAI ⇄ Gemini 反向代理
 * 部署到 Netlify 后访问 /.netlify/functions/gemini/v1/models
 * 环境变量：GEMINI_API_KEY
 */

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta';

exports.handler = async (event, context) => {
  // 允许 CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers };

  const path = event.path.replace(/^\/\.netlify\/functions\/gemini/, '');
  const method = event.httpMethod;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (!geminiKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'GEMINI_API_KEY not configured' }),
    };
  }

  // 1. 模型列表
  if (method === 'GET' && path === '/v1/models') {
    const models = [
      { id: 'gemini-2.5-pro', object: 'model' },
      { id: 'gemini-1.5-pro', object: 'model' },
      { id: 'gemini-1.5-flash', object: 'model' },
    ];
    return { statusCode: 200, headers, body: JSON.stringify({ object: 'list', data: models }) };
  }

  // 2. Chat Completions
  if (method === 'POST' && path === '/v1/chat/completions') {
    const body = JSON.parse(event.body || '{}');
    const { model = 'gemini-2.5-pro', messages, stream } = body;

    // 转换消息格式
    const contents = messages.map(m => ({
      role: m.role === 'system' ? 'user' : m.role,
      parts: [{ text: m.content }],
    }));

    const payload = {
      contents,
      generationConfig: {
        temperature: body.temperature ?? 0.7,
        topP: body.top_p ?? 0.9,
        maxOutputTokens: body.max_tokens ?? 4096,
      },
    };

    const url = `${GEMINI_ENDPOINT}/models/${model}:generateContent?key=${geminiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const gemini = await res.json();
    if (!res.ok) {
      return { statusCode: res.status, headers, body: JSON.stringify(gemini) };
    }

    // 转回 OpenAI 格式
    const candidate = gemini.candidates?.[0];
    const text = candidate?.content?.parts?.[0]?.text ?? '';
    const openai = {
      id: 'chatcmpl-' + Date.now(),
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [{
        index: 0,
        message: { role: 'assistant', content: text },
        finish_reason: candidate?.finishReason ?? 'stop',
      }],
      usage: {
        prompt_tokens: -1,
        completion_tokens: -1,
        total_tokens: -1,
      },
    };

    return { statusCode: 200, headers, body: JSON.stringify(openai) };
  }

  // 未匹配路由
  return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not Found' }) };
};
