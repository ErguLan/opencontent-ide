# OpenContent IDE — Roadmap

## Current Status (July 2026)

### Completed

- [x] AI providers: OpenRouter, OpenAI, Google Gemini, Anthropic Claude, Ollama
- [x] Model registry with custom model support
- [x] Local-first auth (guest mode, optional fork auth)
- [x] Settings page (API keys, model management, theme, language)
- [x] Workspace with AI generation (text + images)
- [x] Agentic mode (multi-step task pipeline with planner)
- [x] Real-time streaming responses (OpenRouter, OpenAI)
- [x] Media panel (upload, role assignment, search, preview)
- [x] Image gallery (/gallery) with auto-save from generation
- [x] Command Palette (Ctrl+K launcher)
- [x] Full CLI engine with /cli route
- [x] Standalone Node.js CLI (cli/index.js)
- [x] Plugin system with hook extensions
- [x] PWA manifest + service worker
- [x] i18n English/Spanish
- [x] Paywall/usage limits (optional, with server endpoints)
- [x] Copy as API (curl, fetch, Python, local server)
- [x] Content calendar, batch mode, quick prompts
- [x] API Server (Express) with OpenAI-compatible endpoint
- [x] MCP Tool Provider
- [x] Auto-save generated images to media library
- [x] ESM/Flat ESLint config
- [x] Vitest test suite (20+ tests)

### In Progress / Recently Added

- [ ] FIX: Project persistence consistency on reload
- [ ] FIX: Agentic modal positioning on all screen sizes

### Planned

| Priority | Feature | Notes |
|----------|---------|-------|
| High | Project persistence stability | Race conditions on load/save/delete |
| High | Agentic mode full integration | Connect toggle to workspace generation |
| Medium | Streaming UI indicator | Show cursor/animation during stream |
| Medium | Enhanced plugin hooks | Bind to generation pipeline, settings panels |
| Medium | More languages (PT, FR, DE) | Community contributions welcome |
| Low | Plugin marketplace / registry | Discoverable extensions |
| Low | GitHub Pages demo | With mocked API responses |
| Low | Docker compose with API key setup | One-command deployment |

### Vision

OpenContent IDE aims to be the **open-source, self-hosted alternative to Higgsfield / Pippit**. The focus is on:

1. **Privacy** — All data stays on the user's machine
2. **Flexibility** — Any AI provider, any model, any key
3. **Extensibility** — Plugins, CLI, custom commands
4. **Accessibility** — Free to use, free to fork, free to modify
