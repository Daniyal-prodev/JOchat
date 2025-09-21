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
  const { messages } = req.body || {};
  const category = categorizeViolation(messages);
  if (category) {
    const message = refusalMessageFor(category);
    const payload = { error: { message, code: 'content_policy_violation', category } };
    console.warn(JSON.stringify({ type: 'moderation_block', category, route: req.path, ts: Date.now() }));
    return res.status(400).json(payload);
  }
  next();
}


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
    const data = await response.json();
    res.status(response.status).json(data);
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
