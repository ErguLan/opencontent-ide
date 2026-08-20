# OpenContent IDE — Architecture

## Overview

OpenContent IDE is a **local-first, open-source, AI-powered content creation studio**. It runs entirely in the browser by default — no server required. All projects, media assets, and settings persist in IndexedDB and localStorage. The app supports multiple AI providers via a **BYOK (Bring Your Own Key)** model and is designed to be self-hosted, extensible, and privacy-focused.

---

## Core Principles

| Principle | Description |
|-----------|-------------|
| **Local-First** | All data lives in the browser. No external database or cloud dependency. |
| **BYOK** | Users provide their own API keys. No bundled AI subscriptions. |
| **Multi-Provider** | OpenRouter, OpenAI, Google (Gemini), Anthropic (Claude), Ollama. |
| **Extensible** | Plugin system, custom models, CLI commands, and provider modules. |
| **i18n** | English and Spanish UI. JSON-based translation system. |
| **No Emojis** | UI uses SVG icons from `public/icons/`. |

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | React 19, Vite 7, React Router DOM 7 | UI framework |
| Styling | Vanilla CSS with CSS variables | Theming (dark/light) |
| State | React Context + hooks | Auth, theme, language, workspace |
| Storage | IndexedDB | Projects, media assets |
| Storage | localStorage | API keys, settings, models |
| AI Providers | Fetch-based modules | OpenRouter, OpenAI, Google, Anthropic, Ollama |
| CLI | Custom engine (CliEngine) | In-browser `/cli` route + standalone Node.js CLI |
| Plugin System | PluginManager + hooks | Extend toolbar, CLI, generation pipeline |
| PWA | manifest.json + service worker | Offline support, installable |
| i18n | JSON files (`en.json`, `es.json`) | Translation with interpolation |
| Tests | Vitest + jsdom | Unit tests for services, CLI, plugins |

---

## Project Structure

```
OpenContentIDE/
├── public/
│   ├── icons/              # SVG icon assets
│   ├── brand/              # Logo, favicon, OG image (user-generated)
│   ├── sw.js               # Service worker
│   └── manifest.json       # PWA manifest
├── src/
│   ├── config/
│   │   └── constants.js    # Routes, storage keys, feature flags, limits
│   ├── context/
│   │   ├── AuthContext.jsx  # Local-first auth (guest by default)
│   │   ├── ThemeContext.jsx # Dark/light theme
│   │   └── LanguageContext.jsx # i18n language state
│   ├── components/
│   │   ├── common/          # Button, Modal, Input, Loader, Tooltip
│   │   ├── icons/           # Icon component + ICONS registry
│   │   ├── cli/             # CommandPalette (launcher)
│   │   └── model/           # ModelSelector
│   ├── features/
│   │   ├── landing/         # Main entry page with prompt input
│   │   ├── workspace/       # Content creation workspace
│   │   │   ├── hooks/
│   │   │   │   ├── useWorkspaceAI.js      # AI generation + agentic loop
│   │   │   │   └── useWorkspaceMedia.js   # Media asset management
│   │   │   └── components/
│   │   │       ├── MediaPanel.jsx         # Asset sidebar panel
│   │   │       ├── ChatInput.jsx          # Chat input form
│   │   │       ├── WorkspaceCanvas.jsx    # Content display area
│   │   │       ├── WorkspaceToolbar.jsx    # Right toolbar
│   │   │       ├── QuickPrompts.jsx       # Template prompts
│   │   │       ├── ContentCalendar.jsx    # Content scheduling
│   │   │       ├── BatchMode.jsx          # Batch generation
│   │   │       ├── CopyAsApiModal.jsx     # API snippet generator
│   │   │       └── AgenticToggle.jsx      # Agentic mode toggle
│   │   ├── settings/        # API keys, models, theme, language
│   │   ├── auth/            # Login page (stub for forks)
│   │   ├── cli/             # Full CLI engine + terminal UI
│   │   │   ├── CliEngine.js    # Command parser, registry, autocomplete
│   │   │   ├── commands.js     # Built-in CLI commands
│   │   │   ├── useCli.js       # React hook for CLI state
│   │   │   ├── CliPage.jsx     # /cli route page
│   │   │   ├── CliTerminal.jsx # Terminal UI component
│   │   │   └── Cli.css         # Classic terminal theme
│   │   └── gallery/         # Image gallery (all generated assets)
│   ├── services/
│   │   ├── ai/
│   │   │   └── index.js     # Unified provider dispatch
│   │   ├── providers/
│   │   │   ├── openrouter.js # OpenRouter provider
│   │   │   ├── openai.js     # OpenAI provider
│   │   │   ├── google.js     # Google Gemini provider
│   │   │   ├── anthropic.js  # Anthropic Claude provider
│   │   │   ├── ollama.js     # Ollama local provider
│   │   │   ├── streaming.js  # SSE streaming helpers
│   │   │   └── shared.js     # Shared error handling
│   │   ├── models/
│   │   │   └── index.js     # Model registry (add/remove/resolve)
│   │   ├── projectsLocal.js  # IndexedDB project CRUD
│   │   ├── mediaService.js   # IndexedDB media CRUD
│   │   ├── freemium.js       # Usage tracking + limits
│   │   ├── metrics.js        # Telemetry
│   │   └── copyAsApi.js      # API code snippet generation
│   ├── plugins/
│   │   ├── PluginManager.js  # Plugin registration + hook system
│   │   ├── builtIn/
│   │   │   └── hello.js      # Example plugin
│   │   └── index.js          # Plugin bootstrap
│   ├── i18n/
│   │   ├── en.json           # English translations
│   │   ├── es.json           # Spanish translations
│   │   └── index.js          # t() function with interpolation
│   ├── styles/
│   │   └── variables.css     # CSS custom properties
│   ├── test/
│   │   └── setup.js          # Vitest setup (localStorage mock)
│   └── utils/
│       └── imageProcessor.js  # Canvas-based logo overlay
├── server/                    # Optional Express API server
│   ├── index.js              # Server entry + routing
│   ├── routes/
│   │   ├── generate.js       # POST /api/generate
│   │   ├── images.js         # POST /api/generate-image
│   │   ├── models.js         # GET /api/models
│   │   ├── openai.js         # POST /v1/chat/completions (OpenAI-compatible)
│   │   └── usage.js          # GET/POST /api/usage (paywall)
│   └── lib/
│       └── providers.js      # Server-side AI provider calls
├── cli/
│   └── index.js              # Standalone Node.js CLI (IPC-ready)
├── mcp/
│   └── index.js              # MCP Tool Provider (stdio)
├── docs/
│   ├── ARCHITECTURE.md        # This file
│   ├── ROADMAP.md             # Project roadmap
│   ├── TRANSLATION_SYSTEM.md  # i18n conventions
│   └── AGENTS.md              # Agent/AI coding conventions
├── scripts/
│   └── generate-assets.py    # Logo/brand PNG generator
├── .env.example               # Environment variables
├── eslint.config.js           # ESLint flat config
├── vitest.config.js           # Test configuration
└── package.json               # Dependencies + scripts
```

---

## AI Provider Architecture

Each provider is a self-contained module in `src/services/providers/` that exposes:

```js
send(prompt, model, options)          → { success, content, model, usage }
generateImage(prompt, model, options) → { success, imageUrl, model }
analyzeImage(imageUrl, prompt, opts)  → { success, analysis, model }
```

The unified entry point `src/services/ai/index.js` routes requests based on the **model registry**. Each model has a `provider` field that maps to the module name.

### Stream Support

Providers with stream support (OpenRouter, OpenAI) accept `options.stream = true` and `options.onChunk(chunk, accumulated)`. The `streaming.js` helper parses SSE responses.

### Adding a New Provider

1. Create `src/services/providers/yourprovider.js` following the interface above
2. Add the provider key to `PROVIDERS` in `src/services/models/index.js`
3. Import and map it in `src/services/ai/index.js`

---

## Model Registry

Models are stored in `localStorage` under `oc_models`. There are **no built-in defaults** — users add their own models via Settings.

| Function | Description |
|----------|-------------|
| `getStoredModels()` | Returns all models |
| `addModel(model)` | Adds a custom model (id, nickname, provider, capabilities) |
| `removeModel(id)` | Removes by ID |
| `resolveModel(id)` | Looks up by ID, falls back to generic OpenRouter model |
| `supportsVision(id)` | Checks if a model has vision capabilities |
| `supportsImageGeneration(id)` | Checks image generation capability |

---

## CLI Architecture

### In-Browser CLI (`/cli` route)

The CLI inside the browser uses:

- **`CliEngine`** — Command parser with quoted argument support, flag parsing (`--key value`), and autocomplete via Tab.
- **Commands** — Registered via `createBuiltinCommands()` in `commands.js`. Covers: `help`, `clear`, `theme`, `lang`, `goto`, `model`, `generate`, `gallery`, `project`, `exit`.
- **Plugins** — Can register additional CLI commands via the `HOOKS.CLI_COMMAND` hook.
- **History** — Persisted to `localStorage` (last 100 commands), navigable with arrow keys.
- **`generate`** — Actually calls `sendToAI()` directly, creates a project, displays text inline, and shows `[Image generated in gallery]` for images.

### Standalone CLI (`cli/index.js`)

A Node.js CLI that runs independently from the React app:

```bash
node cli/index.js
# or: npm run cli (after adding to package.json)
```

Connects to the Express API server (`POST /api/generate`) for AI generation. Requires the server to be running with API keys configured.

---

## Plugin System

`src/plugins/PluginManager.js` provides a hook-based extension system.

### Available Hooks

| Hook | Trigger | Context |
|------|---------|---------|
| `WORKSPACE_TOOLBAR` | Toolbar render | Array of `{ label, icon, action }` |
| `CLI_COMMAND` | CLI command registration | Array of command objects |
| `GENERATION_BEFORE` | Before AI generation | Prompt, model, options |
| `GENERATION_AFTER` | After AI generation | Response, prompt, model |
| `SETTINGS_PANEL` | Settings page | Settings sections |

### Creating a Plugin

```js
export default {
    name: 'my-plugin',
    version: '1.0.0',
    register(manager) {
        manager.addHook('cli.command', (registry) => {
            registry.push({
                name: 'mycmd',
                description: 'Does something',
                run: ({ args }) => ({ type: 'success', message: 'done' })
            });
            return registry;
        });
    }
};
```

Register in `src/plugins/index.js`.

---

## Paywall / Usage Limits

Controlled by `VITE_ENABLE_USAGE_LIMITS=true` in `.env`. When enabled:

- `canUseAction()` checks daily limits before generation
- `incrementUsage()` tracks usage in localStorage
- `openPaywall()` shows a modal when a limit is reached
- Server-side: `/api/usage` endpoints for optional cloud sync

Limits are defined in `src/config/constants.js` under `FREE_LIMITS` and `PRO_LIMITS`.

---

## Project Persistence (IndexedDB)

Projects are stored in an **IndexedDB** database (`OpenContentProjectsDB`):

| Service | Database | Key |
|---------|----------|-----|
| Projects | `OpenContentProjectsDB` | `projects` store |
| Media | `OpenContentMediaDB` | `user-assets` store |

The `saveLocalProject()` function handles both creation and update. On creation (no `id`), it generates a unique ID: `local_{timestamp}_{random}`.

Media assets are saved as **base64 data URLs** in IndexedDB. Generated images are automatically saved to the media library during agentic pipelines and normal image generation.

---

## Gallery (`/gallery`)

All generated and uploaded images appear in the gallery. The gallery:

- Queries `getAllMedia()` from IndexedDB
- Shows thumbnails in a responsive grid
- Supports preview, download, and delete
- Images are auto-saved during generation

---

## Testing

Tests use **Vitest** with jsdom environment.

```bash
npm test          # Run once
npm run test:watch   # Watch mode
```

Current test suites:
- `CliEngine.test.js` — 6 tests (parsing, execution, autocomplete, history)
- `models/index.test.js` — 4 tests (CRUD, resolution, capabilities)
- `i18n/index.test.js` — 6 tests (translation, interpolation, language switch)
- `plugins/PluginManager.test.js` — 4 tests (registration, hooks, dedup)

---

## Environment Variables

See `.env.example` for the full list. Key variables:

| Variable | Required | Purpose |
|----------|----------|---------|
| `VITE_OPENROUTER_API_KEY` | At least one | OpenRouter access |
| `VITE_OPENAI_API_KEY` | Optional | OpenAI access |
| `VITE_GOOGLE_API_KEY` | Optional | Google Gemini access |
| `VITE_ANTHROPIC_API_KEY` | Optional | Anthropic Claude access |
| `VITE_OLLAMA_BASE_URL` | Optional | Ollama URL (default: localhost:11434) |
| `VITE_ENABLE_USAGE_LIMITS` | Optional | Enable paywall/limits |
| `VITE_CLI_ACCESS` | Optional | `public`, `local_only`, or `disabled` |
| `VITE_CLI_ENABLED` | Optional | `true` or `false` |

---

## Quick Start

```bash
git clone <repo>
cd OpenContentIDE
npm install
cp .env.example .env
# Edit .env with your API keys
npm run dev
```

Open `http://localhost:5173` in your browser.

For the API server:
```bash
OPENROUTER_API_KEY=sk-... npm run server:start
```

For the standalone CLI:
```bash
# First start the API server, then:
node cli/index.js
```
