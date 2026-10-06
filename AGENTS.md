# AGENTS.md — OpenContent IDE

## About this project

OpenContent IDE is an open-source, self-hosted, AI-powered content creation studio originally built by Yoll and donated to the community. It is designed to be local-first, BYOK (Bring Your Own Key), and extensible through plugins, skills, and custom AI providers.

This file contains the context and conventions that coding agents need when working on the codebase. It describes the project as it is today. If you find a statement here that the code contradicts, the code wins — fix the code or fix this file, never leave them in conflict.

## Core principles

- **Local-first**: projects, media and artifacts live in the browser (IndexedDB). Settings, model registry and API keys live in localStorage. No server is required for normal use.
- **BYOK**: users provide their own API keys. The project ships no AI access of its own.
- **Never inject, never auto-select**: the model registry starts empty. The app never adds a vendor model ID on the user's behalf and never activates a model the user did not choose. Models are discovered by asking the user's own provider, with the user's own key.
- **Optional SaaS / login**: the codebase includes optional freemium hooks and a login placeholder for forks that want real auth. They are off by default.
- **Open source**: MIT licensed. Contributions welcome.
- **No emojis in code or UI**: use SVG icons from `/public/icons/` or generate assets with scripts.
- **Custom CSS class names**: avoid generic names like `.button`, `.text`, `.card`. Use project-prefixed names (`.oc-*`, `.oc-workspace-*`, `.oc-delivery-*`) to avoid collisions.
- **i18n for all user-facing text**: no hardcoded user-facing strings in components.
- **English code, translated UI**: source code, comments, variable names and file names are in English.

## Tech stack

- React 19 + Vite 7
- React Router DOM 7
- **3 production dependencies, exactly**: `react`, `react-dom`, `react-router-dom`. Anything else must earn its place and be justified.
- Vanilla CSS with custom properties (`src/styles/variables.css`). No Tailwind, no CSS-in-JS, no component framework.
- IndexedDB (via `src/services/db/`) for all persisted domain data; localStorage for settings, keys and the model registry
- Express API server (optional, `server/`), Node.js standalone CLI (`cli/`), MCP providers (`mcp/`)
- Vitest + Testing Library + jsdom for tests

## Important files

### Entry points and config

- `src/App.jsx` — routes. Route table lives in `ROUTES` in `src/config/constants.js`.
- `src/config/constants.js` — app constants, feature flags, routes, localStorage keys, plan limits. Imports the version from `package.json` and re-exports it as `APP_VERSION`. **Do not hardcode a version anywhere**; `VITE_APP_VERSION` is an optional override for forks, documented in `.env.example`.
- `src/context/` — `AuthContext.jsx` (local user by default, optional real auth for forks), `LanguageContext.jsx`, `ThemeContext.jsx`.

### Data layer

- `src/services/db/` — the single entry point for local persistence. One IndexedDB database, `OpenContentDB`, version 1, with three stores: `projects`, `user-assets` and `artifacts` (indexes on `type`, `projectId`, `updatedAt`). Layout:
  - `schema.js` — database name, version, stores, indexes, `applySchema` for `onupgradeneeded`
  - `connection.js` — single cached connection, blocked/version-change handling, `DatabaseUnavailableError`
  - `access.js` — thin `get`/`put`/`add`/`putMany`/`deleteRecord`/`getAll`/`getAllByIndex`/`count`/`clear`/`withTransaction`
  - `records.js` — pure record helpers (normalize, dedupe, collision resolution, `planMerge`)
  - `migration.js` — migration from the three legacy databases and the legacy localStorage key
- Domain services keep product meaning and build on that layer: `src/services/projectsLocal.js`, `src/services/mediaService.js`, `src/services/artifacts/artifactEngine.js`.

**Migration contract.** `OpenContentDB` replaced three separate databases (`OpenContentProjectsDB`, `OpenContentMediaDB`, `OpenContentArtifactsDB`) plus the `oc_local_projects` localStorage key. `runLegacyMigration()` is idempotent, deletes a legacy database only after every record is committed, keeps the newest record on an id collision and reports the conflict, and never memoizes a failed run. If you add a store, extend `schema.js` and give it a migration path — do not create a new database.

### Artifacts and delivery

- `src/services/artifacts/artifactEngine.js` — artifact records, the operation log (`OPERATION_TYPES`), versioning, undo/redo, persistence.
- `src/services/artifacts/diagramEngine.js` — structured diagrams, DSL parsing, auto layout, SVG export.
- `src/services/artifacts/pdfEngine.js` — document/page/block model, PDF serialization, PDF annotations on a separate edit layer.
- `src/services/artifacts/aiArtifactOps.js` — **pure JavaScript validation of AI artifact operations**, no native build step and no backend involved. A fixed allowlist of safe actions plus a per-action argument validation table. Anything outside the allowlist is rejected before it can touch an artifact.
- `src/services/delivery/deliveryState.js` — the delivery state machine. Single source of truth; pure, no React, no IndexedDB, no clock (callers pass `at`), no i18n.

### AI layer

- `src/services/ai/index.js` — provider abstraction and configuration state.
- `src/services/ai/agenticPipeline.js` — the agentic mode pipeline and its canonical step status vocabulary.
- `src/services/ai/toolDefinitions.js`, `toolRuntime.js` — tool surface exposed to the model.
- `src/services/providers/` — self-contained modules: `openrouter.js`, `openai.js`, `google.js`, `anthropic.js`, `ollama.js`, `custom.js`, plus `shared.js`, `streaming.js`, `toolContext.js`.
- `src/services/models/` — the user-owned registry and `providerDiscovery.js`, which asks the user's provider which models their key can reach.

### Features

- `src/features/workspace/` — `Workspace.jsx` is a wiring file only: it composes the 11 hooks in `hooks/` and the components in `components/`. State and behavior live in hooks; presentation in components. Keep it that way; if `Workspace.jsx` grows logic again, that is a regression.
- `src/features/artifacts/ArtifactStudio.jsx` — artifact editing surface, including the delivery panel.
- `src/features/library/LibraryPage.jsx` — unified media + artifact library, with kind filters and delivery-state filters.
- `src/features/setup/AISetupPage.jsx` — three-step onboarding: choose provider, paste credentials, discover and choose a model.
- `src/features/settings/`, `src/features/gallery/`, `src/features/cli/`, `src/features/landing/`, `src/features/auth/`.
- `src/plugins/` — hook-based plugin system. `src/plugins/builtIn/` ships the built-in plugins, including the CLI commands that extend the browser CLI.

### Cross-cutting

- `src/i18n/` — the translation tree. `en.json` and `es.json` hold the main key set in exact parity; `artifactTranslations.js` and `uxTranslations.js` contribute further sections and are merged with `deepMerge` in `src/i18n/index.js`. When you add a key, add it to the right file **and** to its Spanish counterpart.
- `src/components/` — shared UI: `common/` primitives, `icons/Icon.jsx`, `model/`, `cli/` (command palette), `effects/`.
- `src/data/skills.json`, `src/data/quickPrompts.js` — skills/personas and prompt starters.
- `src/test/fakeIndexedDb.js` — in-memory IndexedDB double used by the database tests. It is repository code, not a dependency. Use it instead of reaching for a new package.

### Docs

- `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/TRANSLATION_SYSTEM.md`
- `docs/system/` — per-system docs, including `ARTIFACTS.md`, `AGENTIC_MODE.md`, `AI_PROVIDERS.md`, `MODEL_REGISTRY.md`, `DELIVERY.md`, `MEDIA_GALLERY.md`, `PROJECTS.md`, `PLUGINS.md`, `STREAMING.md`, `AUTH.md`, `FREEMIUM.md`, `CLI.md`, `I18N.md`.

## Contracts you must not break

### Agentic step status vocabulary

`src/services/ai/agenticPipeline.js` exports `AGENTIC_STEP_STATUS` and `AGENTIC_STEP_STATUSES`. The vocabulary is exactly:

```text
waiting  working  completed  failed  skipped
```

`done` and `error` are not statuses. Do not invent new ones.

A failing tool **does not abort the run**. It is recorded and the run continues. The result carries:

```text
failures: [{ stepId, name, code, message, retryable }]
partial:  boolean
retryable: boolean
```

The UI is expected to show partial results and offer a retry. Cancellation (`REQUEST_ABORTED`) is a cancellation, not a failure — keep those two apart.

### Delivery state machine

```text
draft -> in-review -> approved -> published
```

- Forward transitions only. No jumps, no skips, no going back.
- `published` is **terminal**. The way to change a published piece is to create a new version of it.
- Anything else is a programming error, and `validateTransition` reports it as one with a distinct code: `DELIVERY_UNKNOWN_STATE`, `DELIVERY_TERMINAL_STATE`, `DELIVERY_INVALID_TRANSITION`.
- Artifacts: the transition is a normal artifact operation (`set_delivery_state`), so it is versioned and undoable exactly like any other edit.
- Media assets: the delivery state is the asset `status` field, and `updateMediaMetadata` validates the transition.
- State values are stable machine identifiers, never user-facing copy. The interface layer owns the translation keys.

See `docs/system/DELIVERY.md`.

### Model selection invariant

OpenContent never selects a model for the user. The unselected placeholder is located by its marker (`isPlaceholder` / empty id), never by its position in the list — `composeSelectableOptions` in `src/features/workspace/utils/modelSelection.js` exists precisely so that reordering the registry cannot silently activate a model. `isBuiltIn` is always `false`. `src/services/ai/modelSelection.test.js` locks this invariant; keep it green.

## Conventions

### CSS

- Use custom properties from `src/styles/variables.css`.
- Prefer feature-scoped class names like `.oc-workspace-toolbar`, `.oc-button-primary`, `.oc-delivery-badge`.
- No Tailwind, no CSS-in-JS.

### Icons / assets

- Use the `Icon` component with SVG paths defined in `src/components/icons/Icon.jsx`.
- If a new icon is needed, add an SVG under `public/icons/`.
- Never paste emoji characters into source files.

### Translations

- The canonical invocation is `useLanguage()` and `t('key')`.
- All user-facing strings must go through it. Add new keys to both English and Spanish.
- The key tree is split between `en.json`/`es.json` and the `artifactTranslations.js`/`uxTranslations.js` modules. See `docs/TRANSLATION_SYSTEM.md` before changing the structure.

### Components

- Keep components focused and small.
- Move reusable logic into hooks under `src/features/<feature>/hooks/` or `src/hooks/`.
- Use `src/components/common/` for shared UI primitives.
- Handle loading, error, empty, disabled and cancelled states. Do not ship a control that pretends to work.

### AI providers

- Providers are self-contained modules behind a consistent interface.
- The frontend asks for a model by ID; the provider layer resolves how to call it.
- A provider that can list models implements `listModels`. Discovery goes through `discoverProviderModels({ provider, apiKey, baseUrl, signal })`, which reports "unsupported" instead of falling back to a bundled list.
- Users can add custom model IDs with an optional nickname, provider and capabilities.

### Auth

- The default user is local with full access.
- Real authentication is optional and must be explicitly enabled by a fork.
- Do not introduce mandatory external auth providers.

## What to avoid

- Hardcoded Spanish or English strings in JSX.
- Emoji in code or UI.
- Generic CSS class names.
- Hardcoded model IDs or any bundled model catalog.
- Auto-selecting a model for the user, or "helpfully" filling a selection.
- Silent failures. Errors are reported with codes and surfaced in the UI.
- New IndexedDB databases. Extend `OpenContentDB`.
- Mandatory paywalls in the default open-source build.

## Verification

Run these before claiming a change works:

```bash
npm run lint    # ESLint, flat config, must be clean
npm test        # Vitest
npm run build   # Vite production build
```

At the time of writing the suite is 13 test files and 156 tests, all passing. If you add behavior with a contract, add a test that locks the contract — the delivery machine, the agentic status vocabulary and the model-selection invariant are all covered this way.

Other scripts that exist: `npm run dev`, `npm run preview`, `npm run test:watch`, `npm run cli`, `npm run cli:artifacts`, `npm run server:install`, `npm run server:start`, `npm run mcp:start`, `npm run mcp:artifacts`.

## Brand note

OpenContent IDE was donated by Yoll to the open-source community. The project should remain neutral and not depend on Yoll-specific services or branding, but it is fine to mention the donation in the About section and docs. CI fails the build if proprietary branding appears under `src/`.
