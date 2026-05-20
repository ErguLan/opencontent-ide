# Changelog

All notable changes to OpenContent IDE will be documented in this file.

## [0.1.0] — 2026-05-19

### Added
- **Core IDE** — React + Vite workspace with canvas, chat input, toolbar, and sidebar.
- **BYOK Multi-Provider** — Support for OpenRouter, Gemini, and Ollama.
- **Ollama Integration** — Settings UI with Test Connection, auto-detection of local models.
- **Skills System** — 6 switchable AI personas defined in `skills.json`.
- **Custom Models** — Text and image model override in Settings.
- **Local-First Auth** — Auto-login as "Local User" with PRO access. No Firebase.
- **Chat Memory** — Persistent conversation history per project using IndexedDB.
- **Copy as API** — Generate curl, JavaScript, Python, and local server snippets from any prompt.
- **API Server Mode** — Express REST API with 5 endpoints including OpenAI-compatible `v1/chat/completions`.
- **MCP Tool Provider** — stdio MCP server with `generate_content`, `generate_image`, `list_skills`, `list_models` tools.
- **Docker Support** — Multi-stage Dockerfile, docker-compose.yml, and nginx.conf.
- **GitHub Actions CI** — Build matrix (Node 20/22), branding leak check, secret leak scan.
- **i18n** — English and Spanish translations.
- **Dark/Light Mode** — Theme toggle with CSS variables.
- **Version History** — Navigate between generation versions.
- **Media Panel** — Upload, tag, and activate image assets (templates, logos, overlays).
- **Workspace Decomposition** — Extracted hooks (`useWorkspaceProjects`, `useWorkspaceMedia`) and components (`WorkspaceCanvas`, `ChatInput`, `WorkspaceToolbar`, `MediaPanel`, `CopyAsApiModal`).

### Removed
- All proprietary Yoll/TLUK/HoneyCopper branding and references.
- Firebase Authentication dependency.
- Client-side anti-development measures (`security.js`, devtools blocking).
- SaaS-specific usage validation against external servers.
