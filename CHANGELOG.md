# Changelog

All notable changes to OpenContent IDE will be documented in this file.

## [0.9.5] — 2026-10-06 — Golden

0.9.3 was the Pre-Golden functional baseline. This 0.9.5 cut is Golden: the work below is tagged and `package.json` carries `0.9.5`.

### Removed

- The unused native core module and its JavaScript bridge. It was never compiled, produced no artifact, and had no build step, so nothing shipped from it. Artifact operation validation is now pure JavaScript in `src/services/artifacts/aiArtifactOps.js`, with no native or optional backend requirement.
- The technical debt documentation folder, including the Workspace model-selection debt entry. That debt is closed by the workspace refactor below.
- The superseded workspace AI hook, replaced by the workspace hook decomposition.
- The two native-toolchain npm scripts. There is no native build step left to check.

### Added

- **One local database.** `OpenContentDB` (version 1) now holds the `projects`, `user-assets` and `artifacts` stores behind a single cached connection, with a thin access layer, cross-domain transactions and record helpers in `src/services/db/`.
- **Legacy data migration.** `runLegacyMigration()` brings data over from the three previous per-domain databases and from the legacy `oc_local_projects` localStorage key. It is idempotent, reports id collisions (newest record wins), never deletes a legacy source until every record is committed, and does not memoize a failed run.
- **Delivery state machine.** `draft -> in-review -> approved -> published` in `src/services/delivery/deliveryState.js`. Forward-only transitions, a terminal `published` state, and distinct error codes for an unknown state, a terminal state and an out-of-order move. Documented in `docs/system/DELIVERY.md`.
- **Delivery in the UI.** A delivery panel in Artifact Studio, a delivery-state filter across media and artifacts in the Library, and delivery state on media assets. For artifacts a transition is a normal operation, so it is versioned and undoable like any other edit.
- **Model discovery with the user's own key.** `discoverProviderModels({ provider, apiKey, baseUrl, signal })` asks the user's provider which models their credentials can reach. `listModels` is implemented for OpenAI, OpenRouter, Google (paginated), Anthropic (paginated) and Ollama. A provider that cannot be listed reports that fact instead of falling back to a bundled list.
- **Three-step AI setup.** `/setup` now walks through choose provider, paste credentials (with a notice that the key lives only in browser localStorage) and discover/choose a model, with manual model ID entry when listing is unsupported or fails.
- **In-memory IndexedDB test double.** `src/test/fakeIndexedDb.js` so database behavior is tested without adding a dependency.

### Changed

- **Agentic mode reports failure instead of hiding it.** A failing tool no longer aborts the run: it is recorded, the run continues, and the result carries `failures`, `partial` and `retryable`. The UI shows partial results and offers a retry. Cancellation stays a cancellation, not a failure.
- **Agentic step status vocabulary is exactly five values**: `waiting`, `working`, `completed`, `failed`, `skipped`. `done` and `error` no longer exist.
- **Workspace decomposition.** `Workspace.jsx` is a wiring file again: it composes the 11 workspace hooks and the shared components, with no AI call or prompt assembly inside it.
- **Model selection is marker-based, not order-based.** The unselected placeholder is located by its marker rather than its position, so reordering the registry cannot silently activate a model. The invariant is locked by a test.
- One composer (`ChatInput`) serves both the first prompt and later iterations, instead of two separate controls.
- The workspace `NOT_CONFIGURED` state routes to `/setup` instead of asking the user to edit a `.env` file.
- The workspace sidebar links to `/library`. The `/gallery` route remains available and in use.
- The version has a single source of truth in `package.json`. `src/config/constants.js` imports it and exports it as `APP_VERSION`; `Settings.jsx` consumes that. `VITE_APP_VERSION` remains an optional documented override.

### Documentation

- Synchronized `AGENTS.md`, `README.md` and `CHANGELOG.md` with the code: unified database, delivery states, model discovery, the three-step setup, the agentic status contract, and the workspace structure.
- Added `docs/system/DELIVERY.md`; extended the architecture, roadmap and per-system docs to match.

## [0.9.3] — 2026-08-20

### Added
- Artifact Engine with editable diagram, document, and PDF artifact types.
- Artifact Studio with AI-assisted structured operations, versioning, undo/redo, import/export, and protected PDF originals.
- Deterministic allowlist and argument validation for every AI artifact operation, running entirely in the browser.
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
- Tracked the remaining Workspace model-selection and legacy UX cleanup in a separate debt-tracking folder, so the debt was visible rather than hidden. That folder is gone as of the Unreleased entry above: the debt is closed.

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