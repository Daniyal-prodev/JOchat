require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: true, methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type'], credentials: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

function candidateListFor(model) {
  const m = String(model || '').toLowerCase();
  if (m.includes('openai')) return ['openai/gpt-oss-20b:free'];
  if (m.includes('gemini') || m.includes('google')) return ['google/gemini-2.5-flash-image-preview:free'];
  if (m.includes('grok') || m.includes('x-ai')) return ['x-ai/grok-2-mini:free', 'meta-llama/llama-3.1-8b-instruct:free'];
  if (m.includes('qwen')) return ['qwen/qwen2.5-7b-instruct:free', 'qwen/qwen2.5-14b-instruct:free', 'qwen/qwen2.5-72b-instruct:free'];
  if (m.includes('moonshot') || m.includes('kimi')) return ['moonshotai/moonshot-v1-8k:free', 'qwen/qwen2.5-7b-instruct:free'];
  return [model].filter(Boolean);
}

app.post('/chat', async (req, res) => {
  try {
    if (!OPENROUTER_API_KEY) return res.status(401).json({ error: { message: 'Server missing OpenRouter API key' } });
    const referer = req.headers.origin || (req.headers.host ? `https://${req.headers.host}` : undefined);
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        ...(referer ? { 'HTTP-Referer': referer } : {}),
        'X-Title': 'JOchat'
      },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    res.status(500).json({ error: { message: error.message } });
  }
});

app.post('/api/chat-stream', async (req, res) => {
  if (!OPENROUTER_API_KEY) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.write(`event: error\ndata: ${JSON.stringify({ error: 'Server missing OpenRouter API key' })}\n\n`);
    return res.end();
  }

  const { model, messages, temperature, max_tokens } = req.body || {};
  const candidates = candidateListFor(model);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');

  async function tryCandidate(idx) {
    const tryModel = candidates[idx];
    let controller = new AbortController();
    let timeoutId;
    let receivedUseful = false;

    try {
      const referer = req.headers.origin || (req.headers.host ? `https://${req.headers.host}` : undefined);
      const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
          ...(referer ? { 'HTTP-Referer': referer } : {}),
          'X-Title': 'JOchat'
        },
        body: JSON.stringify({ model: tryModel, messages, temperature, max_tokens, stream: true }),
        signal: controller.signal
      });

      if (!upstream.ok || !upstream.body) {
        if (idx < candidates.length - 1) return tryCandidate(idx + 1);
        res.write(`event: error\ndata: ${JSON.stringify({ error: 'Service temporarily unavailable', status: upstream.status })}\n\n`);
        return res.end();
      }

      const stream = upstream.body;

      const setInactivityTimeout = () => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => controller.abort(), 10000);
      };
      setInactivityTimeout();

      stream.on('data', (chunk) => {
        setInactivityTimeout();
        const str = chunk.toString('utf8');
        if (str.includes('"error"')) {
          clearTimeout(timeoutId);
          if (idx < candidates.length - 1) {
            controller.abort();
            return tryCandidate(idx + 1);
          }
          res.write(`event: error\ndata: ${JSON.stringify({ error: 'Upstream error' })}\n\n`);
          return res.end();
        }
        if (/\bdata:\s*(?!\[DONE\])/.test(str)) receivedUseful = true;
        res.write(chunk);
      });

      stream.on('end', () => {
        clearTimeout(timeoutId);
        if (!receivedUseful && idx < candidates.length - 1) {
          return tryCandidate(idx + 1);
        }
        res.write('event: done\ndata: [DONE]\n\n');
        res.end();
      });

      stream.on('error', () => {
        clearTimeout(timeoutId);
        if (idx < candidates.length - 1) return tryCandidate(idx + 1);
        res.write(`event: error\ndata: ${JSON.stringify({ error: 'Stream error' })}\n\n`);
        res.end();
      });
    } catch (_e) {
      if (idx < candidates.length - 1) return tryCandidate(idx + 1);
      res.write(`event: error\ndata: ${JSON.stringify({ error: 'Network error' })}\n\n`);
      res.end();
    }
  }

  tryCandidate(0);
});

app.get('/chat.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
