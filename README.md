# OpenContent IDE

> Open source AI content creation studio. Self-hosted. BYOK. Ollama-compatible.

**OpenContent IDE** is a self-hosted, open-source content creation IDE powered by AI. Think "Cursor, but for social media content." Generate text, images, and creative assets using your own API keys or local models via Ollama.

---

## Features

- **BYOK (Bring Your Own Key)** — Use OpenRouter, Gemini, or OpenAI keys. No subscriptions.
- **Ollama Support** — Run 100% locally with your own GPU. No API keys needed.
- **Skills System** — Switchable AI personas (Content Creator, SEO Writer, Copywriter, etc.)
- **Local-First** — All data stored in your browser (IndexedDB). Nothing leaves your machine.
- **Dark/Light Mode** — Beautiful, minimal UI with theme support.
- **i18n** — English and Spanish out of the box.
- **Export** — Download your projects as JSON or images.
- **Version History** — Iterate on content with full version tracking.

---

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/opencontent-ide.git
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

## Supported Providers

| Provider | Text | Images | Local | Free Tier |
|----------|------|--------|-------|-----------|
| **OpenRouter** | Yes | Yes | No | Yes (free models) |
| **Gemini** | Yes | Yes | No | Yes |
| **Ollama** | Yes | No | Yes | Yes (your GPU) |

---

## Skills / Personas

OpenContent IDE uses a **Skills** system — switchable AI personas that change the agent's behavior:

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
src/
├── config/           # Constants, feature flags
├── context/          # React contexts (Auth, Theme, Language)
├── data/             # Skills/personas JSON
├── features/         # Pages (Landing, Workspace, Settings)
├── components/       # Reusable UI components
├── services/         # AI service, local storage, media
├── styles/           # CSS variables, animations
├── i18n/             # Translations (EN/ES)
└── utils/            # Helpers, image processing
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
- [ ] Ollama integration
- [ ] API Server Mode (REST endpoints)
- [ ] OpenAI-compatible endpoint (`/v1/chat/completions`)
- [ ] Docker support
- [ ] MCP Tool Provider
- [ ] Chat with persistent memory
- [ ] "Copy as API" button

---

## License

MIT — see [LICENSE](LICENSE).

---

Built with React, Vite, and a lot of AI.
