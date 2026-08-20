# Changelog

All notable changes to OpenContent IDE will be documented in this file.

## [0.9.3] — 2026-08-20

### Added
- Artifact Engine with editable diagram, document, and PDF artifact types.
- Artifact Studio with AI-assisted structured operations, versioning, undo/redo, import/export, and protected PDF originals.
- Rust/WASM-ready `oc-core` for deterministic validation and artifact operations.
- Artifact REST API, MCP tools, plugin hooks, browser CLI commands, and standalone CLI parity.
- Global Command Palette and keyboard-first navigation.
- Unified Library for media and artifacts.
- Dedicated AI Setup for provider registration, explicit model registration, and independent text/vision/image selection.
- Additional UX states, accessibility improvements, search/filtering, save feedback, safer destructive actions, and CLI diagnostics.

### Changed
- Model registry now starts empty and OpenContent never auto-selects vendor models.
- Stale or unknown model IDs remain unconfigured instead of receiving implicit providers/capabilities.
- Ollama is considered configured only when the user has explicitly registered compatible models.
- Landing and Workspace onboarding now use explicit provider/model setup language.
- Imported PDF editing is explicitly non-destructive; the original remains protected until edits are truly embedded.
- CLI remote requests use protocol-safe fetch behavior and support scripting-oriented output and status commands.
- Gallery deletion now supports a short Undo window.

### Documentation
- Added Artifact system documentation.
- Added `docs/technical-debt/WORKSPACE_MODEL_SELECTION.md` to track the remaining Workspace model-selection and legacy UX cleanup without hiding the debt.

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
