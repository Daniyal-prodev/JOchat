# JOchat

Multi-AI Chat Comparison Platform

## Local Development

Requirements:
- Node 18+
- OPENROUTER_API_KEY

Setup:
1) Install dependencies
   npm install

2) Start server with your key
   export OPENROUTER_API_KEY=&lt;your_key&gt;
   npm start

3) Open in browser
Realtime (optional):
- Set TAVILY_API_KEY in your env to enable a Realtime toggle in the UI.
- When enabled, the server performs a brief web search and includes summarized context with sources before streaming.
- Health: GET /api/health => hasSearchKey shows availability.

   http://localhost:3000/chat.html

Health check:
- GET http://localhost:3000/api/health =&gt; {"ok":true,"hasKey":true}

## Owner bypass

Requests can include X-User-Email to bypass moderation for the owner.
- OWNER_EMAIL = aribdaniyal88@gmail.com (see server.js)

Frontend sends this header automatically if currentUser.email is set.
To simulate locally, in the browser console:
localStorage.setItem('jochat_user', JSON.stringify({ email: 'aribdaniyal88@gmail.com', name: 'Owner' }))

## Streaming reliability improvements

- Separate connect (20s) and inactivity (45s) timeouts for SSE
- Robust fallback chains in server.js (candidateListFor)
- SSE error events include upstream status and final model tried
- Frontend SSE parser handles error events and always clears loaders

Primary endpoint:
POST /api/chat-stream
Body example:
{
  "model": "gemini",
  "messages": [{"role":"user","content":"Say hello in one short sentence."}],
  "temperature": 0.5,
  "max_tokens": 128
}

Curl example with owner header:
curl -N -X POST http://localhost:3000/api/chat-stream \
  -H 'Content-Type: application/json' \
  -H 'X-User-Email: aribdaniyal88@gmail.com' \
  -d '{"model":"gemini","messages":[{"role":"user","content":"Say hello"}]}'

## Deployment (Render)

render.yaml declares:
- NODE_VERSION=18
- OPENROUTER_API_KEY (sync: false)

Steps:
1) In Render dashboard (service name: jochat-preview), add:
   OPENROUTER_API_KEY = &lt;your OpenRouter key&gt;
2) Deploy
3) Verify:
   GET https://&lt;render-app&gt;/api/health =&gt; {"ok":true,"hasKey":true}
4) Test /chat.html ensuring currentUser.email === "aribdaniyal88@gmail.com"

Notes:
- Free-tier upstreams can return 400/429. Fallbacks mitigate most cases, but consider a paid-capacity key for stricter guarantees.
- Secrets are never logged; server logs structured streaming lifecycle events.
# JOchat 💬

Multi‑AI chat comparison app with an Express backend proxying OpenRouter and a Tailwind-powered static frontend.

---

## 📁 Structure

```
JOchat/
├── server.js          # Express backend (proxies to OpenRouter)
├── public/            # Frontend files served statically
├── package.json       # Scripts and dependencies
├── .env               # Runtime env (local only, not committed)
└── render.yaml        # Render deployment config (preview)
```

---

## ⚙️ Environment

Create a local env file from the sample and set your key:

```bash
cd JOchat
cp .env.sample .env
# Then edit .env and set:
# OPENROUTER_API_KEY=your_openrouter_api_key_here
```

Required variables:
- OPENROUTER_API_KEY: Your OpenRouter API key
- PORT: Optional, defaults to 3000

The server reads env from `.env` via `dotenv`.

---

## 🧪 Run locally

```bash
cd JOchat
npm install
npm run dev
# Open http://localhost:3000
```

Endpoints:
- Static UI: served from `public/`
- Chat API: `POST /chat` (frontend calls this; backend injects OPENROUTER_API_KEY)

If the key is missing, `/chat` returns 401 with a clear error.

---

## 🚀 Deploy (Render preview)

A reproducible Render config is included at `render.yaml`.

Steps:
1. Push branch to GitHub
2. In Render, “New +” → “Blueprint” → select the repo
3. Service will be detected from `render.yaml`
4. Set environment variable in the service:
   - `OPENROUTER_API_KEY` = your key
5. Deploy. The app will be available at a stable URL. Free plan may spin down but the URL remains valid.

Build/Run commands (from render.yaml):
- build: `npm install`
- start: `npm start`

---

## 🤖 Models

Frontend UI includes options like:
- ChatGPT: `openai/gpt-4o-mini`
- Gemini: `google/gemini-flash-1.5`
- DeepSeek: `deepseek/deepseek-chat`
- Grok: `x-ai/grok-3-mini`
- And others as configured in the UI files

All requests route through backend `/chat` using the server-side API key.

---

## 🔒 CORS

Server uses `cors({ origin: true })` which reflects the request origin. This works for localhost and typical preview domains. Adjust if locking to specific domains is required.

---

## 📝 Notes

- Canonical frontend pages are in `public/` (`index.html`, `chat.html`).  
- Server serves `public` statically and falls back to `public/index.html` for unknown paths.
- Do not commit real secrets. Use `.env.sample` for sharing keys required.
