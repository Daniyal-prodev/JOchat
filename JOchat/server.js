require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: true, methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type', 'X-User-Email'], credentials: false }));
app.use(express.json());
const OWNER_EMAIL = 'aribdaniyal88@gmail.com';

app.use(express.static(path.join(__dirname, 'public')));
function categorizeViolation(messages = []) {
  const text = (messages || []).map(m => (m && m.content) || '').join(' ').toLowerCase();
  const rules = [
    { cat: 'sexual_content_minors', rx: /\bcsam|\bchild\s*sexual|\bminor\s*sexual|\bunder\s*age\s*sex|\bchildren\s*sex/ },
    { cat: 'terrorism_violence', rx: /\bterrorism|\bbuild\s*a\s*bomb|\bexplosive\s*recipe|\bbioweapon|\bchemical\s*weapon|\bmake\s*a\s*gun/ },
    { cat: 'self_harm', rx: /\bsuicide|\bself[-\s]?harm|\bkms\b|\bkill\s*myself|\bhow\s*to\s*cut\s*myself/ },
    { cat: 'hate', rx: /\bhate\s*speech|\bgenocide|\bethnic\s*cleansing|\bhate\s*crime|\bexterminate\s+(?:a|the)\s+(?:race|religion|group)/ },
    { cat: 'illegal_drugs', rx: /\billegal\s*drugs\s*(?:manufacture|synthesis|sell|buy)|\bhow\s*to\s*cook\s*meth|\bfentanyl\s*synthesis/ },
    { cat: 'cybercrime', rx: /\bhacking\s*tutorial|\bexploit\s*zero[-\s]?day|\bbackdoor\s*code|\bcredential\s*stuffing|\bphishing\s*kit|\bdox(?:ing|x)\/?\b/ },
    { cat: 'medical', rx: /\bdiagnose\s+me|\bmedical\s+diagnosis|\bprescribe\s+medicine|\bwhich\s+drug\s+should\s+i\s+take|\bantibiotic\s+dose/ },
    { cat: 'legal', rx: /\blegal\s+advice|\bhow\s+to\s+beat\s+a\s+case|\bwrite\s+a\s+contract|\bshould\s+i\s+sue/ },
    { cat: 'financial', rx: /\bfinancial\s+advice|\bwhich\s+stock\s+to\s+buy|\bguaranteed\s+returns|\bpump\s+and\s+dump/ },
    { cat: 'sensitive_pii', rx: /\bssn\b|\bsocial\s*security\s*number|\bcredit\s*card\s*(?:number)?|\bcvv\b|\bbank\s*account\s*number|\bpassport\s*number/ }
  ];
  for (const r of rules) {
    if (r.rx.test(text)) return r.cat;
  }
  return null;
}

function refusalMessageFor(category) {
  if (!category) return null;
  if (category === 'self_harm') return 'I can’t help with self-harm. If you’re in immediate danger, contact local emergency services. You can reach your local suicide prevention hotline for support.';
  if (category === 'medical') return 'I can’t provide medical advice. Please consult a qualified healthcare professional for diagnosis or treatment.';
  if (category === 'legal') return 'I can’t provide legal advice. Please consult a qualified attorney for guidance on legal matters.';
  if (category === 'financial') return 'I can’t provide financial advice. Consider consulting a licensed financial advisor for personalized guidance.';
  if (category === 'sensitive_pii') return 'I can’t help request or share highly sensitive personal data such as SSN or credit card numbers.';
  return 'I can’t assist with this request due to safety and policy reasons.';
}

function moderationGuard(req, res, next) {
  const ownerEmail = String(req.headers['x-user-email'] || '').toLowerCase().trim();
  const isOwner = ownerEmail === OWNER_EMAIL.toLowerCase();
  console.log(JSON.stringify({ type: 'moderation_check', route: req.path, ownerEmail, isOwner, ts: Date.now() }));
  if (isOwner) return next();
  const { messages } = req.body || {};
  const category = categorizeViolation(messages);
  if (category) {
    const message = refusalMessageFor(category);
    const payload = { error: { message, code: 'content_policy_violation', category } };
    console.warn(JSON.stringify({ type: 'moderation_block', category, route: req.path, ts: Date.now(), ownerBypass: false }));
    return res.status(400).json(payload);
  }
  next();
}


const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

function candidateListFor(model) {
  const original = String(model || '');
  const m = original.toLowerCase();

  if (original.includes('/') && original.includes(':')) {
    if (m.startsWith('google/') || m.includes('gemini')) {
      return [
        original,
        'google/gemini-1.5-flash:free',
        'deepseek/deepseek-r1-distill-llama-70b:free',
        'qwen/qwen-2.5-14b-instruct:free',
        'qwen/qwen-2.5-72b-instruct:free',
        'openai/gpt-oss-20b:free'
      ];
    }
    if (m.startsWith('deepseek/')) {
      return [
        original,
        'qwen/qwen-2.5-14b-instruct:free',
        'qwen/qwen-2.5-72b-instruct:free',
        'openai/gpt-oss-20b:free'
      ];
    }
    if (m.startsWith('openai/')) {
      return [
        original,
        'qwen/qwen-2.5-14b-instruct:free',
        'qwen/qwen-2.5-72b-instruct:free',
        'deepseek/deepseek-r1-distill-llama-70b:free'
      ];
    }
    if (m.startsWith('x-ai/')) {
      return [
        original,
        'deepseek/deepseek-r1-distill-llama-70b:free',
        'qwen/qwen-2.5-14b-instruct:free',
        'qwen/qwen-2.5-72b-instruct:free'
      ];
    }
    if (m.startsWith('qwen/')) {
      return [
        original,
        'qwen/qwen-2.5-14b-instruct:free',
        'qwen/qwen-2.5-72b-instruct:free',
        'deepseek/deepseek-r1-distill-llama-70b:free'
      ];
    }
    return [original];
  }

  if (m.includes('openai')) return ['openai/gpt-oss-20b:free'];

  if (m.includes('gemini') || m.includes('google')) {
    return [
      'google/gemini-2.0-flash:free',
      'google/gemini-1.5-flash:free',
      'deepseek/deepseek-r1-distill-llama-70b:free',
      'qwen/qwen-2.5-7b-instruct:free',
      'openai/gpt-oss-20b:free'
    ];
  }

  if (m.includes('grok') || m.includes('x-ai')) {
    return [
      'x-ai/grok-2-mini:free',
      'deepseek/deepseek-r1-distill-llama-70b:free',
      'qwen/qwen-2.5-7b-instruct:free'
    ];
  }

  if (m.includes('qwen')) return ['qwen/qwen-2.5-7b-instruct:free', 'qwen/qwen-2.5-14b-instruct:free', 'qwen/qwen-2.5-72b-instruct:free'];
  if (m.includes('moonshot') || m.includes('kimi')) return ['moonshotai/kimi-k2:free', 'qwen/qwen-2.5-7b-instruct:free'];
  if (m.includes('deepseek')) return ['deepseek/deepseek-r1-distill-llama-70b:free'];
  return [original].filter(Boolean);
}
app.post('/chat', moderationGuard);


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
    const text = await response.text();
    console.log(JSON.stringify({ type: 'upstream_chat_complete', status: response.status, ok: response.ok, len: text?.length || 0, ts: Date.now() }));
    res.status(response.status).send(text);
  } catch (error) {
    res.status(500).json({ error: { message: error.message } });
  }
});

app.post('/api/chat-stream', moderationGuard);

app.post('/api/chat-stream', async (req, res) => {
  if (!OPENROUTER_API_KEY) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.write(`event: error\ndata: ${JSON.stringify({ error: 'Server missing OpenRouter API key' })}\n\n`);
    return res.end();
  }

  const { model, messages, temperature, max_tokens } = req.body || {};
  const candidates = candidateListFor(model);
  console.log(JSON.stringify({ type: 'candidates', model, candidates, ts: Date.now() }));

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
      console.log(JSON.stringify({ type: 'upstream_stream_try', model: tryModel, idx, ts: Date.now() }));
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
        res.write(`event: error\ndata: ${JSON.stringify({ error: 'Service temporarily unavailable', status: upstream.status, model: tryModel })}\n\n`);
        return res.end();
      }

      console.log(JSON.stringify({ type: 'upstream_stream_open', status: upstream.status, ok: upstream.ok, hasBody: !!upstream.body, idx, ts: Date.now() }));
      const stream = upstream.body;

      controller.signal.addEventListener('abort', () => {
        if (idx < candidates.length - 1) return;
        try {
          res.write(`event: error\ndata: ${JSON.stringify({ error: 'Timeout waiting for response', model: tryModel })}\n\n`);
        } finally {
          res.end();
        }
      });

      let connectTimer;
      const resetInactivity = () => {
        clearTimeout(connectTimer);
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => controller.abort(), 45000);
      };
      connectTimer = setTimeout(() => controller.abort(), 20000);
      resetInactivity();

      stream.on('data', (chunk) => {
        resetInactivity();
        const str = chunk.toString('utf8');
        console.log(JSON.stringify({ type: 'upstream_chunk', idx, len: str.length, head: str.slice(0, 200) }));
        if (str.includes('"error"')) {
          clearTimeout(timeoutId);
          if (idx < candidates.length - 1) {
            controller.abort();
            return tryCandidate(idx + 1);
          }
          res.write(`event: error\ndata: ${JSON.stringify({ error: 'Upstream error', model: tryModel })}\n\n`);
          return res.end();
        }
        if (/\bdata:\s*(?!\[DONE\])/.test(str)) receivedUseful = true;
        res.write(chunk);
      });

      stream.on('end', () => {
        clearTimeout(timeoutId);
        if (!receivedUseful && idx < candidates.length - 1) {
          console.warn(JSON.stringify({ type: 'fallback_due_to_no_useful', idx, ts: Date.now() }));
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

app.get('/api/health', (req, res) => {
  res.json({ ok: true, hasKey: !!OPENROUTER_API_KEY });
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
