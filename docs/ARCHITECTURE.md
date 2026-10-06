# OpenContent IDE — Architecture

## Overview

OpenContent IDE is a **local-first, open-source, AI-powered content creation studio**. It runs entirely in the browser: projects, media assets, artifacts and settings persist in IndexedDB and `localStorage`, and no server is required. AI access is **BYOK (Bring Your Own Key)** across five providers plus an OpenAI-compatible custom endpoint. The application is also self-hostable (static build, or the optional Express API) and extensible through plugins, CLI commands and custom provider modules.

---

## Core Principles

| Principle | Description |
|-----------|-------------|
| **Local-first** | All data lives in the browser. No external database, no cloud dependency, no telemetry endpoint. |
| **BYOK** | Users provide their own API keys. The app bundles no AI access and no model catalogue. |
| **No implicit models** | The registry starts empty and the app never injects or auto-selects a vendor model ID. |
| **Multi-provider** | OpenRouter, OpenAI, Google (Gemini), Anthropic, Ollama, plus a custom OpenAI-compatible endpoint. |
| **Extensible** | Plugin hooks, custom providers, custom models, browser CLI commands, REST API and MCP. |
| **i18n** | English and Spanish. Translation keys are split across four files and merged at load time. |
| **No emojis in UI** | Icons are SVG from `public/icons/` or the `Icon` registry. |

---

## Tech Stack

Three production dependencies. Everything else is dev tooling.

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Dependencies | `react`, `react-dom` 19 | UI framework |
| Dependencies | `react-router-dom` 7 | Routing |
| Build | Vite 7 | Dev server and production bundle |
| Styling | Vanilla CSS with CSS variables | Theming (dark/light). No Tailwind, no CSS-in-JS. |
| State | React Context + feature hooks | Auth, theme, language, workspace |
| Storage | IndexedDB (`OpenContentDB`) | Projects, media assets, artifacts |
| Storage | `localStorage` | API keys (`oc_k_*`), settings, model registry, selections |
| AI providers | `fetch`-based modules | See `docs/system/AI_PROVIDERS.md` |
| CLI | `CliEngine` | In-browser `/cli` route + standalone Node CLI |
| Plugins | `PluginManager` + 13 hooks | Extend toolbar, CLI, generation, artifacts, PDF |
| PWA | `public/manifest.json` + `public/sw.js` | Service worker is registered in production builds only |
| i18n | 2 JSON files + 2 JS modules | `deepMerge` into one tree per language |
| Tests | Vitest 4 + jsdom | 13 files, 156 tests |

Everything runs in JavaScript in the browser. There is no compiled native core, no separate core package and no build step outside Vite.

---

## Project Structure

```
OpenContentIDE/
├── public/
│   ├── icons/                  # 28 tracked SVG icons
│   ├── sw.js                   # Service worker
│   └── manifest.json           # PWA manifest
├── src/
│   ├── main.jsx                # Root render + service worker registration
│   ├── App.jsx                 # Route table
│   ├── config/
│   │   └── constants.js        # Routes, storage keys, feature flags, limits, APP_VERSION
│   ├── context/
│   │   ├── AuthContext.jsx     # Local-first auth (guest profile, full access)
│   │   ├── ThemeContext.jsx    # Dark/light
│   │   └── LanguageContext.jsx # i18n language state + useLanguage()
│   ├── components/
│   │   ├── cli/                # CommandPalette, GlobalCommandPalette (Ctrl+K)
│   │   ├── common/             # Button, Input, Loader, Modal, Tooltip
│   │   ├── effects/            # Starfield
│   │   ├── icons/              # Icon component + ICONS registry
│   │   └── model/              # ModelSelector
│   ├── data/
│   │   ├── skills.json         # Switchable AI personas
│   │   └── quickPrompts.js     # Template starters
│   ├── features/
│   │   ├── landing/            # Entry page (/), prompt handover
│   │   ├── setup/              # AI Setup (/setup): provider + model registration
│   │   ├── workspace/          # Workspace.jsx, hooks/, components/, utils/
│   │   ├── library/            # Unified library (/library): media + artifacts
│   │   ├── gallery/            # Image gallery (/gallery)
│   │   ├── artifacts/          # Artifact Studio (/artifacts, /artifacts/:id)
│   │   ├── settings/           # API keys, models, theme, language, about
│   │   ├── auth/               # Login (stub for forks)
│   │   └── cli/                # CliEngine, commands, terminal UI, /cli route
│   ├── services/
│   │   ├── ai/
│   │   │   ├── index.js             # sendToAI / generateImage / analyzeImage dispatch
│   │   │   ├── agenticPipeline.js   # Multi-step pipeline + step status contract
│   │   │   ├── toolDefinitions.js   # Tool schemas and fallback-command parsing
│   │   │   └── toolRuntime.js       # Tool execution
│   │   ├── providers/          # openrouter, openai, google, anthropic, ollama, custom,
│   │   │                       # streaming, shared, toolContext
│   │   ├── models/
│   │   │   ├── index.js             # Model registry (localStorage `oc_models`)
│   │   │   └── providerDiscovery.js # Asks the provider which models the key can reach
│   │   ├── db/                 # Unified persistence: schema, connection, access,
│   │   │                       # records, migration
│   │   ├── delivery/
│   │   │   └── deliveryState.js     # draft -> in-review -> approved -> published
│   │   ├── artifacts/
│   │   │   ├── artifactEngine.js    # Operations, undo/redo, versions, persistence
│   │   │   ├── aiArtifactOps.js     # AI action allowlist and application
│   │   │   ├── diagramEngine.js
│   │   │   └── pdfEngine.js
│   │   ├── projectsLocal.js    # Project CRUD (public API unchanged by unification)
│   │   ├── mediaService.js     # Media asset CRUD (public API unchanged)
│   │   ├── chatHistory.js      # Per-project chat log, own database
│   │   ├── imageArtifacts.js   # Generated-image artifact wrapper
│   │   ├── brandKit.js         # Brand assets injected into prompts
│   │   ├── filePersistence.js  # Local save settings
│   │   ├── integration/        # openInIde.js: external desktop IDE link contract
│   │   ├── externalSessions.js # Picks up work produced by the standalone CLI/MCP
│   │   ├── freemium.js         # Optional usage tracking + limits
│   │   ├── metrics.js          # Local counters only
│   │   └── copyAsApi.js        # API snippet generation
│   ├── plugins/
│   │   ├── PluginManager.js
│   │   ├── builtIn/            # hello.js, artifacts.js
│   │   └── index.js
│   ├── i18n/
│   │   ├── index.js            # t(), deepMerge, language list
│   │   ├── en.json             # English base tree
│   │   ├── es.json             # Spanish base tree
│   │   ├── artifactTranslations.js  # { en, es } artifact subsections
│   │   └── uxTranslations.js        # { en, es } landing/workspace/setup/library subsections
│   ├── styles/
│   │   ├── variables.css       # CSS custom properties
│   │   ├── global.css
│   │   └── animations.css
│   ├── test/
│   │   ├── setup.js            # Vitest setup
│   │   └── fakeIndexedDb.js    # In-repo in-memory IndexedDB double
│   └── utils/
│       ├── helpers.js
│       └── imageProcessor.js   # Canvas-based logo overlay
├── server/                     # Optional Express API (own package.json)
│   ├── index.js                # Entry, routing, /api/health
│   ├── routes/                 # generate, images, models, openai, usage, storage,
│   │                           # sessions, clientConfig, agentic, artifacts
│   └── lib/                    # providers, agentic, editorContext, skills
├── cli/
│   ├── index.js                # Standalone Node CLI
│   └── artifacts.js
├── mcp/
│   ├── index.js                # MCP tools over stdio
│   └── artifacts.js
├── docs/
│   ├── ARCHITECTURE.md         # This file
│   ├── ROADMAP.md
│   ├── TRANSLATION_SYSTEM.md
│   └── system/                 # One document per subsystem
├── scripts/
│   └── generate-assets.py      # Generates public/brand/ locally (not tracked)
├── AGENTS.md                   # Agent/AI coding conventions (repository root)
├── CONTRIBUTING.md
├── eslint.config.js
├── vitest.config.js
└── package.json
```

---

## Routes

| Route | Screen | Notes |
|-------|--------|-------|
| `/` | Landing | Prompt entry; hands an `initialPrompt` to the workspace |
| `/workspace` | Workspace | Main working area |
| `/project/:id` | Workspace | Same screen, project resolved from the route |
| `/setup` | AI Setup | Provider key + explicit model registration |
| `/settings` | Settings | Keys, models, theme, language, about (shows `APP_VERSION`) |
| `/library` | Library | Unified view over media assets and artifacts, with delivery state filters |
| `/gallery` | Gallery | Image-only grid. Still routed and in use. |
| `/artifacts`, `/artifacts/:id` | Artifact Studio | Artifact editing, versions, delivery panel |
| `/cli` | CLI | Terminal UI over `CliEngine` |
| `/login` | Login | Stub for forks |
| `*` | Redirect to `/` | |

---

## Workspace Architecture

`src/features/workspace/Workspace.jsx` is a wiring file only: about 15 KB, no AI call, no prompt assembly. It instantiates 11 hooks and renders 12 components.

| Hook | Responsibility |
|------|----------------|
| `useAgentRun` | Agent state machine, abort controllers, error/info modals, pending artifact saves |
| `useModelSelection` | Model options, active selections, capability checks |
| `useWorkspaceGeneration` | Prompt assembly, direct runs, agentic runs, project persistence |
| `useWorkspaceResults` | Versions, history, current version, copy helpers |
| `useWorkspaceBatch` | Batch generation and batch persistence |
| `useWorkspaceActions` | Save, export, download, copy-as-API, artifact save approval |
| `useWorkspaceFreemium` | Usage counters, plan limits, paywall gate |
| `useWorkspacePreferences` | Agentic mode, image config, creative task mode |
| `useWorkspaceMedia` | Media assets, upload, roles, attachments |
| `useWorkspaceProjects` | Project list, selection, deletion, route loading |
| `useWorkspaceEntry` | Navigation state arriving from other surfaces |

`utils/` holds pure helpers: `modelSelection.js`, `agentSteps.js`, `errorMessages.js`, `promptHelpers.js`, `promptTemplates.js`.

### Not-configured routing

When no provider key is available, the agent state is `not_configured`. The canvas renders `WorkspaceNotConfigured`, whose only call to action navigates to `/setup`. There is no path that asks the user to edit an environment file from inside the app.

### Never auto-selecting a model

The option services publish an explicit unselected placeholder. `composeSelectableOptions` (`utils/modelSelection.js`) locates that placeholder by its `isPlaceholder` marker, never by position, so reordering the registry cannot silently activate a model. `resolveSelection` clears an invalid stored selection instead of substituting another one. This invariant is locked by `src/services/ai/modelSelection.test.js`.

### One composer

`ChatInput` is the only composer. It is a `<textarea>` (not a single-line `<input>`), and it handles the first prompt and every iteration identically — `Workspace.jsx` submits through the same `handleIteration` in both cases and only changes the `isIteration` flag. Batch entry and calendar entry write into the same composer value instead of using a second control.

---

## Local Persistence

All locally persisted domains live in **one** IndexedDB database.

| Property | Value |
|----------|-------|
| Database | `OpenContentDB` |
| Version | `1` |
| Record schema version | `schemaVersion: 1` stamped on every stored record |

| Object store | Key path | Indexes | Service |
|--------------|----------|---------|---------|
| `projects` | `id` | none | `projectsLocal.js` |
| `user-assets` | `id` | none | `mediaService.js` |
| `artifacts` | `id` | `type`, `projectId`, `updatedAt` (all non-unique) | `artifacts/artifactEngine.js` |

### Why one database

- One connection, cached at module level. `onversionchange` closes it so another tab can upgrade; `onblocked` is given 5 seconds and then fails with an actionable message instead of hanging.
- Cross-domain transactions become possible. `withTransaction(storeNames, mode, work)` opens one transaction over several stores.
- Migration is one coherent step instead of three.

### Layers

| Module | Responsibility |
|--------|----------------|
| `db/schema.js` | Database name, version, store and index definitions |
| `db/connection.js` | Single cached connection, version-change and blocked handling |
| `db/access.js` | `get`, `getAll`, `getAllKeys`, `getAllByIndex`, `put`, `add`, `putMany`, `deleteRecord`, `count`, `clear`, `withTransaction` |
| `db/records.js` | Pure helpers: timestamps, sorting, dedupe, collision resolution, merge planning |
| `db/migration.js` | Legacy database and legacy `localStorage` migration |

The service layer holds no IndexedDB ceremony: it calls `ensureDatabaseReady()` and then uses the access helpers.

### Degradation

If IndexedDB is unavailable (private mode, blocked site data, non-browser runtime), every function stays exported and fails with `DatabaseUnavailableError` (`code: 'INDEXEDDB_UNAVAILABLE'`) carrying an actionable message. There is no opaque exception and no silent data loss.

### Public API stability

`projectsLocal.js`, `mediaService.js` and `artifactEngine.js` keep the same exported functions as before the unification. The unification is internal. Only new records and migrated records carry `schemaVersion: 1`.

### Migration

On first use, the three legacy databases (`OpenContentProjectsDB`, `OpenContentMediaDB`, `OpenContentArtifactsDB`) and the legacy `localStorage` key `oc_local_projects` are imported.

- **Idempotent.** A second run plans no writes.
- **Non destructive.** A legacy database is deleted only after every record is committed. If the copy fails, the legacy database stays intact and the next run retries.
- **No silent overwrites.** On an `id` collision the newest record by `updatedAt` (falling back to `createdAt`) wins, and the conflict is reported. A tie keeps the stored record.
- Records without a usable `id` are reported as skipped, not dropped.
- Deleting a legacy database still open in another tab is reported as not done. The data is already copied, so the leftover is inert.

The localStorage import only runs when the `projects` store is empty, and the key is removed only after the write succeeds.

`chatHistory.js` keeps its own `OpenContentChatDB`. This is a conscious exception: chat history is append-only, is never queried across domains and is cleared independently, so unifying it would add migration risk without a benefit.

### Testing the data layer

`src/test/fakeIndexedDb.js` is an in-memory IndexedDB double written for this repository. **`fake-indexeddb` is not a dependency of this project** and is not expected to be: the double covers only the surface the data layer uses (open plus upgrade, read/write transactions, `keyPath` stores, non-unique indexes, `deleteDatabase`, `onblocked`) plus a `failPuts` hook to exercise write failures. Do not assume a general-purpose IndexedDB polyfill is available.

---

## AI Provider Architecture

Each provider is a self-contained module in `src/services/providers/`:

```js
send(prompt, model, options)          -> { success, content, model, usage }
generateImage(prompt, model, options) -> { success, imageUrl, model }
analyzeImage(imageUrl, prompt, opts)  -> { success, analysis, model }
listModels({ apiKey, baseUrl, signal }) -> { success, models } | { success: false, error, status }
```

`src/services/ai/index.js` routes by the model registry: `resolveModel(id)` returns the stored entry, then `getProviderModule(model.provider)` selects the module. See `docs/system/AI_PROVIDERS.md`.

### Model resolution: unknown IDs stay unconfigured

`resolveModel(id)` has **no fallback model**. An ID that is not in the registry resolves to:

```js
{
    id,
    nickname: id,
    provider: null,
    type: 'text',
    capabilities: { text: false, imageGeneration: false, vision: false,
                    toolCalling: false, imageEditing: false },
    isBuiltIn: false
}
```

This is a deliberate product decision, not an omission. The registry is user-owned: OpenContent never invents a vendor model ID, never guesses which provider serves one, and never claims a capability it cannot verify. A missing or stale selection therefore surfaces as "not configured" and routes the user to `/setup`, instead of silently spending money against an unexpected account with a model that may not exist.

`TEXT_MODEL_CATALOG` and `IMAGE_MODEL_CATALOG` exist in `src/services/ai/index.js` and are **empty arrays**.

### Model discovery

`src/services/models/providerDiscovery.js` asks the user's own provider which models their own key can reach, using that provider's model-listing endpoint. It is not a bundled list.

- Implemented for `openai`, `openrouter`, `google` (`pageSize=1000`), `anthropic` (cursor pagination with `after_id`, capped at 10 pages) and `ollama` (`/api/tags`).
- A provider that cannot be listed resolves to `{ supported: false, reason, models: [] }` with a reason. It never returns an error and never returns an invented list.
- Failure codes: `PROVIDER_LIST_UNAUTHORIZED` (401 and 403 deliberately share one code), `PROVIDER_LIST_RATE_LIMITED`, `PROVIDER_LIST_PROVIDER_DOWN`, `PROVIDER_LIST_FAILED`, `PROVIDER_LIST_NETWORK_ERROR`, `PROVIDER_LIST_TIMEOUT`, `PROVIDER_LIST_ABORTED`.
- Nothing is filtered or hidden. When the API does not report capabilities, the entry is marked `CAPABILITIES_UNKNOWN` instead of being guessed.
- `addModelsFromDiscovery` requires at least one explicit capability, skips IDs already registered, and always writes `isBuiltIn: false`.

### Streaming

OpenRouter and OpenAI accept `options.stream` with `options.onChunk(chunk, accumulated)`. `providers/streaming.js` parses SSE. Google, Anthropic and Ollama use the non-streaming path. See `docs/system/STREAMING.md`.

---

## Delivery Lifecycle

Content is not finished when it is generated. Artifacts and media assets share one lifecycle:

```
draft -> in-review -> approved -> published
```

Forward only, no jumps, `published` is terminal. Three distinct error codes (`DELIVERY_UNKNOWN_STATE`, `DELIVERY_TERMINAL_STATE`, `DELIVERY_INVALID_TRANSITION`) keep "you cannot un-publish this" separate from "review comes before approval". On artifacts the transition is an ordinary operation (`set_delivery_state`), so it is undoable and versioned. The AI action allowlist has no delivery action, so a model cannot approve or publish.

One asymmetry, stated rather than smoothed over: **media delivery history is not replayable.** Artifacts record transitions in their operation log; media assets carry only the current state in the asset `status` field. Full model and rationale in `docs/system/DELIVERY.md`.

---

## Artifact Studio

`src/services/artifacts/` treats text, images, diagrams, editable documents and PDFs as artifacts.

- `artifactEngine.js` — operation log with `operations`/`operationCursor`, `undoArtifact`/`redoArtifact` replay through `rebuildFromHistory`, `snapshotArtifact` for versions. Replay rewinds delivery to `baseDelivery` before re-applying, so a transition is never validated against a state it already passed through.
- `aiArtifactOps.js` — fixed action allowlist with per-action argument validation. Artifact content is treated as data to be read, never as instructions to be followed.
- `diagramEngine.js` — structured nodes/connectors, four node shapes, drag editing on a 10 px grid, `A -> B` DSL, fixed-grid auto-layout, SVG export. Connector edits are not logged as operations, so they are not undoable.
- `pdfEngine.js` — dependency-free PDF serializer (catalog, page tree, one Helvetica font resource, per-page content stream, xref table) for generated documents. Imported PDFs are immutable originals with a separate annotation layer; page-stream rewriting, font reconstruction and OCR stay behind the `PDF_PROCESSOR` extension point.

Interfaces: UI `/artifacts`, browser CLI commands, standalone `cli/artifacts.js`, REST `/api/artifacts/*`, MCP `mcp/artifacts.js`, plugin hooks.

---

## CLI Architecture

### In-browser CLI (`/cli`)

- **`CliEngine`** — pure command parser with quoted arguments, `--key value` flags and escaped quotes. Exposes `parse()`, `execute()`, `autocomplete()` and history. Pure logic, no React.
- **Commands** — registered in `features/cli/commands.js`: `help`, `clear`, `theme`, `lang`, `goto`, `model`, `generate`, `agent`, `gallery`, `project`, `exit`. The `artifact`, `diagram` and `document` commands come from the built-in artifact plugin.
- **History** — last 100 commands in `localStorage` (`oc_cli_history`), navigable with arrow keys.
- **Suggestions** — the terminal offers up to 8 inline completions from `autocomplete()`; selection is driven by the input's key handler.
- **Global palette** — `GlobalCommandPalette` (Ctrl/Cmd+K) also opens on `` ` `` and `,`.

### Standalone CLI (`cli/index.js`, `cli/artifacts.js`)

Node.js processes that forward generation to the Express API (`POST /api/generate`) and require it to be running. Filesystem access is opt-in and narrow: `OC_GALLERY_DIR` is read-only by default, writes require `OC_ALLOW_LOCAL_WRITES=true` and are confined to `OC_OUTPUT_DIR` or directories listed in `OC_ALLOWED_CLONE_DIRS`, and existing files are protected unless `OC_ALLOW_OVERWRITE=true`.

---

## Plugin System

`src/plugins/PluginManager.js` provides a hook-based extension system. `register()` skips a duplicate name with a console warning. `runHook`/`runHookSync` pass each handler's return value to the next (pipeline pattern) and isolate handler failures with a console error, so a broken extension degrades the hook instead of the app.

| Hook | Trigger | Context |
|------|---------|---------|
| `WORKSPACE_TOOLBAR` | Workspace toolbar render | Array of toolbar items |
| `WORKSPACE_CANVAS_AFTER` | After the workspace canvas renders | Canvas context |
| `CLI_COMMAND` | CLI initialization | Array of command objects |
| `SETTINGS_PANEL` | Settings page render | Array of setting sections |
| `GENERATION_BEFORE` | Before AI generation | `{ prompt, model, options }` |
| `GENERATION_AFTER` | After AI generation | `{ response, prompt, model }` |
| `ARTIFACT_IMPORT` | Artifact import | Artifact payload |
| `ARTIFACT_EXPORT` | Artifact export | Artifact payload |
| `ARTIFACT_RENDER` | Artifact render | Artifact payload |
| `ARTIFACT_OPERATION_BEFORE` | Before an artifact operation | Operation |
| `ARTIFACT_OPERATION_AFTER` | After an artifact operation | Operation |
| `DIAGRAM_SYMBOL_PROVIDER` | Diagram symbol resolution | Symbol request |
| `PDF_PROCESSOR` | PDF import/export processing | PDF payload |

Two built-in plugins ship: `hello.js` (reference example, registers a CLI command) and `artifacts.js` (artifact and toolbar hooks). Register them in `src/plugins/index.js`.

### Hook wiring status

Only `CLI_COMMAND` has an application call site today: `features/cli/useCli.js` runs it after registering the built-in commands, so `artifact`, `diagram` and `document` are available in `/cli`. The other twelve hooks are declared in `HOOKS`, accept registrations, and are exercised by the test suite, but no application code runs them yet. They are extension points, not active instrumentation.

---

## Auth

`src/context/AuthContext.jsx` auto-authenticates as a local guest profile (`local-guest`, plan `PRO`) persisted under `oc_user`. No server, no external provider, full access by default. `loginGoogle()` and `loginEmail()` are stubs that return `{ success: false, error: '…not configured in this build…' }`; a fork replaces them. See `docs/system/AUTH.md`.

---

## Usage Limits

Optional. `canUseAction(action, { isPro, userId, projectCount, currentProjectIterations })` compares the user's counters against `FREE_LIMITS` or `PRO_LIMITS` from `src/config/constants.js`, `incrementUsage()` tracks counters in `localStorage` keyed by user and UTC date, and `useWorkspaceFreemium.gateAction` returns a boolean or opens a translated paywall modal. The Express `/api/usage` endpoints are optional and in-memory only.

Two things to keep straight:

- The default guest profile is `PRO`, so a fresh install is unrestricted. That, not a feature flag, is what keeps the open-source build free of a mandatory paywall.
- `ENABLE_USAGE_LIMITS` is exported from `src/config/constants.js` but nothing in `src/` imports it, so it does not currently gate anything.

Enforcement is client-side and advisory: clearing site data resets the counters. See `docs/system/FREEMIUM.md`.

---

## Testing

Vitest with the jsdom environment.

```bash
npm test          # run once
npm run test:watch
npm run lint      # eslint, flat config
```

Current state: **13 test files, 156 tests, all passing; lint clean.**

| Test file | Tests | Covers |
|-----------|-------|--------|
| `services/db/database.test.js` | 52 | Unified database, migration, idempotency, collision handling, unavailable-database paths |
| `services/delivery/deliveryState.test.js` | 36 | Transitions, terminal state, error codes, history, pending review |
| `services/ai/agenticPipeline.test.js` | 15 | Strategies, step statuses, failures, skip rules |
| `services/artifacts/artifactEngine.test.js` | 11 | Operations, undo/redo, versions |
| `services/models/providerDiscovery.test.js` | 10 | Listing, unsupported providers, error codes |
| `features/cli/CliEngine.test.js` | 6 | Parsing, execution, autocomplete, history |
| `i18n/index.test.js` | 6 | Lookup, interpolation, language switching |
| `services/models/index.test.js` | 5 | Registry CRUD, unconfigured unknown IDs |
| `services/ai/modelSelection.test.js` | 4 | Never-auto-select invariant |
| `plugins/PluginManager.test.js` | 4 | Registration, hooks, dedupe |
| `services/brandKit.test.js` | 3 | Brand context assembly |
| `services/artifacts/diagramEngine.test.js` | 2 | Diagram operations |
| `services/artifacts/pdfEngine.test.js` | 2 | PDF serialization |

---

## Environment Variables

See `.env.example`. All are optional; keys can also be entered in Settings and are stored per browser under `oc_k_*`.

| Variable | Purpose |
|----------|---------|
| `VITE_OPENROUTER_API_KEY` | OpenRouter access |
| `VITE_OPENAI_API_KEY` | OpenAI access |
| `VITE_GEMINI_API_KEY` (or `VITE_GOOGLE_API_KEY`) | Google Gemini access |
| `VITE_ANTHROPIC_API_KEY` | Anthropic access |
| `VITE_CUSTOM_API_KEY` | Custom OpenAI-compatible endpoint |
| `VITE_OLLAMA_BASE_URL` | Ollama URL (default `http://localhost:11434`) |
| `VITE_APP_NAME` | Display name override |
| `VITE_APP_VERSION` | Version override. The canonical value lives in `package.json` and is imported by `src/config/constants.js`; `Settings.jsx` displays it. |
| `VITE_AI_REQUEST_TIMEOUT_MS` | Provider request timeout (default `45000`) |
| `VITE_ENABLE_USAGE_LIMITS` | Activate freemium limits |
| `VITE_CLI_ACCESS` | `public`, `local_only` or `disabled` |
| `VITE_CLI_ENABLED` | `false` disables the CLI |

Node-side (`cli/`, `mcp/`, `server/`) variables are read by those processes, not by Vite: `OC_GALLERY_DIR`, `OC_OUTPUT_DIR`, `OC_ALLOWED_CLONE_DIRS`, `OC_ALLOW_LOCAL_WRITES`, `OC_ALLOW_OVERWRITE`.

---

## Quick Start

```bash
git clone <repo>
cd OpenContentIDE
npm install
cp .env.example .env     # optional; keys can also be added in Settings
npm run dev
```

Open `http://localhost:5173`, then register a provider key and at least one model at `/setup`. A project is created when the first prompt is submitted; results persist in the browser.

Optional services:

```bash
npm run server:start   # Express API (needs its own npm install in server/)
npm run cli            # standalone CLI (requires the API server)
npm run mcp:start      # MCP tools over stdio
```