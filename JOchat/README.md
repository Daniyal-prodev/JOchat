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
