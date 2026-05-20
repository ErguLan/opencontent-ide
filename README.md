# OpenContent IDE

[![CI](https://github.com/ErguLan/opencontent-ide/actions/workflows/ci.yml/badge.svg)](https://github.com/ErguLan/opencontent-ide/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-green.svg)](https://nodejs.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

> Open source AI content creation studio. Self-hosted. BYOK. Ollama-compatible.

**OpenContent IDE** is a self-hosted, open-source content creation IDE powered by AI. Think "Cursor, but for social media content." Generate text, images, and creative assets using your own API keys or local models via Ollama.

---

## Features

- **BYOK (Bring Your Own Key)** — Use OpenRouter, Gemini, or OpenAI keys. No subscriptions.
- **Ollama Support** — Run 100% locally with your own GPU. No API keys needed.
- **Skills System** — Switchable AI personas (Content Creator, SEO Writer, Copywriter, etc.)
- **Local-First** — All data stored in your browser (IndexedDB). Nothing leaves your machine.
- **Chat Memory** — Persistent conversation history per project.
- **Copy as API** — Generate curl/JS/Python snippets from any prompt.
- **API Server Mode** — REST API with OpenAI-compatible endpoint.
- **MCP Tool Provider** — Use as an AI tool from Claude, Gemini, etc.
- **Dark/Light Mode** — Beautiful, minimal UI with theme support.
- **i18n** — English and Spanish out of the box.
- **Docker Ready** — One-click deploy with Docker Compose.
- **Export** — Download your projects as JSON or images.
- **Version History** — Iterate on content with full version tracking.

---

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/ErguLan/opencontent-ide.git
cd opencontent-ide
npm install
```

### 2. Configure your keys

```bash
cp .env.example .env
# Edit .env and add at least one API key
```

### 3. Run

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Using with Ollama (100% Local)

No API keys required! Just install [Ollama](https://ollama.com), pull a model, and go:

```bash
# Install Ollama, then:
ollama pull llama3
```

Set `VITE_OLLAMA_BASE_URL=http://localhost:11434` in your `.env` file. Models without a `/` in the ID (e.g., `llama3`, `mistral`) are automatically routed to Ollama.

---

## API Server Mode

Run the headless API server for integration with n8n, LangChain, Make, etc.:

```bash
npm run server:install
OPENROUTER_API_KEY=sk-... npm run server:start
```

**Endpoints:**

| Method | URL | Description |
|--------|-----|-------------|
| POST | `/api/generate` | Generate text content |
| POST | `/api/generate-image` | Generate an image |
| GET | `/api/models` | List available models |
| GET | `/api/health` | Health check |
| POST | `/v1/chat/completions` | OpenAI-compatible endpoint |

---

## MCP Tool Provider

Use OpenContent IDE as a tool from AI agents:

```json
{
  "mcpServers": {
    "opencontent": {
      "command": "node",
      "args": ["path/to/opencontent-ide/mcp/index.js"],
      "env": {
        "OPENROUTER_API_KEY": "your-key"
      }
    }
  }
}
```

**Available MCP Tools:** `generate_content`, `generate_image`, `list_skills`, `list_models`

---

## Supported Providers

| Provider | Text | Images | Local | Free Tier |
|----------|------|--------|-------|-----------|
| **OpenRouter** | Yes | Yes | No | Yes (free models) |
| **Gemini** | Yes | Yes | No | Yes |
| **Ollama** | Yes | No | Yes | Yes (your GPU) |

---

## Skills / Personas

Switchable AI personas that change the agent's behavior:

| Skill | Description |
|-------|-------------|
| Content Creator | General creative content assistant |
| SEO Writer | Search-engine optimized content |
| Brand Designer | Visual concepts and brand identity |
| Social Strategist | Platform-specific social media content |
| Copywriter | Persuasive ad copy and CTAs |
| Meme Creator | Viral meme concepts |

Add your own skills by editing `src/data/skills.json`.

---

## Project Structure

```
├── src/                  # Frontend (React + Vite)
│   ├── config/           # Constants, feature flags
│   ├── context/          # React contexts (Auth, Theme, Language)
│   ├── data/             # Skills/personas JSON
│   ├── features/         # Pages + decomposed components & hooks
│   ├── components/       # Reusable UI components
│   ├── services/         # AI, chat history, media, metrics, copyAsApi
│   ├── styles/           # CSS variables, animations
│   ├── i18n/             # Translations (EN/ES)
│   └── utils/            # Helpers, image processing
├── server/               # API Server (Express)
│   ├── routes/           # REST endpoints
│   └── lib/              # Shared provider logic
├── mcp/                  # MCP Tool Provider (stdio)
├── Dockerfile            # Multi-stage Docker build
├── docker-compose.yml    # One-click deployment
└── .github/workflows/    # CI pipeline
```

---

## Environment Variables

See [.env.example](.env.example) for all available options.

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_OPENROUTER_API_KEY` | At least one key | OpenRouter API key |
| `VITE_GEMINI_API_KEY` | At least one key | Google Gemini API key |
| `VITE_OLLAMA_BASE_URL` | No | Ollama URL (default: localhost:11434) |
| `VITE_ENABLE_USAGE_LIMITS` | No | Enable freemium limits (for SaaS forks) |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

1. Fork the repo
2. Create your feature branch (`git checkout -b feature/amazing`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing`)
5. Open a Pull Request

---

## Roadmap

- [x] Core content generation (text + images)
- [x] BYOK multi-provider support
- [x] Skills/Personas system
- [x] Local-first data storage
- [x] i18n (EN/ES)
- [x] Ollama integration
- [x] API Server Mode (REST endpoints)
- [x] OpenAI-compatible endpoint (`/v1/chat/completions`)
- [x] Docker support
- [x] MCP Tool Provider
- [x] Chat with persistent memory
- [x] "Copy as API" button
- [x] GitHub Actions CI
- [ ] Streaming responses
- [ ] Plugin system
- [ ] More languages (PT, FR, DE)
- [ ] GitHub Pages demo

---

## License

MIT — see [LICENSE](LICENSE).

---

Built with React, Vite, and a lot of AI.
