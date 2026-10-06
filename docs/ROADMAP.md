# OpenContent IDE — Roadmap

## Current Status (August 2026)

This section describes what exists in the tree today, not what was true at an earlier release. Dates refer to the version in `package.json`.

### Delivered

**Providers and models**
- [x] Provider modules: OpenRouter, OpenAI, Google Gemini, Anthropic, Ollama, and a custom OpenAI-compatible endpoint
- [x] User-owned model registry in `localStorage`. It starts empty; there is no bundled catalogue (`TEXT_MODEL_CATALOG` and `IMAGE_MODEL_CATALOG` are empty arrays)
- [x] No implicit models. Unknown or stale model IDs resolve as unconfigured instead of falling back to a vendor model, and the unselected option is located by marker, never by position
- [x] Provider model discovery: the app asks the user's own provider, with the user's own key, which models that account can reach. Providers that cannot be listed report "unsupported" instead of returning an invented list
- [x] `/setup` onboarding: register a provider key, discover models, declare capabilities, choose one. Independent text, vision and image selections
- [x] Streaming responses for OpenRouter and OpenAI

**Content and artifacts**
- [x] Workspace with direct and agentic generation (text, vision, images)
- [x] Agentic pipeline with three strategies, a five-value step status vocabulary, `failures` / `partial` / `retryable`, and no silent loss of a failed step
- [x] Artifact engine: text, image, diagram, document and PDF artifacts
- [x] Operation log with undo/redo and version snapshots
- [x] AI artifact operation allowlist with per-action argument validation, running entirely in the browser
- [x] Generated images as first-class artifacts: the artifact references the media asset instead of copying the bytes, `set_image_config` records every regeneration, and undo restores the previous image
- [x] Images generated before this model are adopted by an idempotent backfill that never deletes or rewrites media
- [x] Diagram editing with `A -> B` DSL, auto-layout and SVG export
- [x] Generated-document PDF export; imported PDFs kept as immutable originals with a non-destructive annotation layer
- [x] Delivery lifecycle `draft -> in-review -> approved -> published`, shared by artifacts and media assets, with `published` terminal
- [x] Media panel, `/gallery`, and a unified `/library` over media and artifacts with kind and delivery-state filters

**Platform**
- [x] Unified local persistence: one `OpenContentDB` (version 1) with the `projects`, `user-assets` and `artifacts` stores, one cached connection, and an idempotent migration from the three legacy databases and the legacy `localStorage` key
- [x] Media and artifacts exposed over CLI, REST and MCP; filesystem writes are opt-in and directory-confined
- [x] Plugin system with 13 hooks, including artifact import/export/render/operation, diagram symbols and PDF processing
- [x] In-browser CLI (`/cli`) and standalone Node CLI
- [x] Express API server with an OpenAI-compatible endpoint
- [x] MCP tool provider
- [x] i18n English/Spanish across a merged key tree
- [x] Optional freemium limits, off by default
- [x] PWA manifest and service worker
- [x] Docker files and CI configuration
- [x] Vitest suite: 18 files, 199 tests, all passing; `npm run lint` clean

### Known gaps

These are real, not aspirational. Each one is visible in the code.

- **Media delivery history is not recorded for uploaded assets.** Artifacts record delivery transitions in their operation log, so a state change is undoable and versioned, and a generated image is such an artifact. Uploaded assets (logos, templates, references, overlays) carry the current state in the asset `status` field and have no operation log, so their past transitions are not stored and advancing one is not undoable. The asymmetry is documented, not hidden.
- **Regenerating an image accumulates assets.** Each regeneration stores the new bytes as a new asset chained with `parentAssetId` and keeps the previous one so undo has something real to restore. Nothing prunes them, so a heavily iterated image grows the media store. Deleting a version has to stay an explicit user action.
- **The Studio cannot create an image artifact from scratch.** An image artifact always comes from a generation, because creating one requires an image model and a provider call. The Studio lists, edits, versions and advances the images that exist; it does not originate them.
- **Third-party PDF import is preview plus annotation.** Page-stream rewriting, font reconstruction and OCR stay behind the `PDF_PROCESSOR` extension point. Rewriting a content stream without a real parser would corrupt documents users cannot recover.
- **Streaming is limited by provider.** Google, Anthropic and Ollama use the non-streaming path.
- **Usage limits are advisory.** They are checked client-side in `localStorage`, so clearing site data resets them. There is no server-side enforcement in the default build. The default guest profile is `PRO`, which is what keeps a fresh install unrestricted.
- **`ENABLE_USAGE_LIMITS` is not wired.** It is exported from `src/config/constants.js` and read by nothing, so `gateAction` evaluates limits regardless. Wiring the flag into `gateAction` and into the paywall is pending.
- **Ollama discovery reads `/api/tags`.** It reports what a local instance has installed; it says nothing about which of those models have vision or image-generation capability.
- **Model capabilities are user-declared.** Discovery reports what an API returns. When an API does not report capabilities, the entry is marked `CAPABILITIES_UNKNOWN` rather than guessed, and the user must declare them.

### Planned

Not started. Priority reflects cost of being wrong, not excitement.

| Priority | Item | Notes |
|----------|------|-------|
| High | Cross-domain deletes through `withTransaction` | The primitive exists and is unit-tested; no caller spans several stores yet, so deleting a project can still leave its artifacts and media behind |
| Medium | Media delivery history | Either give uploaded assets a small event log or state plainly in the UI that media history is not recorded. Generated images already have it: they are artifacts |
| Medium | PDF import beyond preview | Page streams, font reconstruction, OCR. Gated on a real parser |
| Medium | Streaming for the remaining providers | Anthropic and Google both expose streaming endpoints that are simply not wired |
| Medium | Wire the remaining plugin hooks | Only `CLI_COMMAND` has an application call site today. The other twelve are declared and registerable but never run, so a plugin cannot currently observe or alter generation, the workspace toolbar, settings or artifact operations |
| Medium | Wire `ENABLE_USAGE_LIMITS` | The flag exists but nothing reads it; the paywall gate runs unconditionally |
| Medium | Wire the streaming opt-in flag | `isStreamingEnabled()`/`setStreamingEnabled()` and the `oc_streaming_enabled` key exist, are called from nowhere, and have no Settings toggle, so agentic text steps always stream |
| Medium | More languages (PT, FR, DE) | Four files per language: two JSON plus the `{ en, es }` modules. Community contributions welcome |
| Low | Plugin discovery surface | A documented local registry of installed plugins |
| Low | Unpublish workflow | A real product decision with its own audit trail, not a flag on an existing state. Currently deliberately absent because `published` is terminal |

### Vision

OpenContent IDE is built to be **the workspace it wants to exist**: local-first, self-hosted, BYOK, open source, and extensible by anyone who forks it.

The priorities behind that:

1. **Privacy** — projects, media and artifacts stay in the user's browser. Keys are stored per browser, not on a server we operate.
2. **User-owned models** — the registry belongs to the user. The app asks their provider what their key can reach; it never injects, guesses or auto-selects a model ID, and `isBuiltIn` is always `false`.
3. **Honest failure** — a failed step is reported, not swallowed. A published artifact is published; it does not quietly fall back to approved. What the app cannot do is documented instead of simulated.
4. **Extensibility** — plugins, CLI commands, custom providers and a REST/MCP surface over the same services the UI uses.
5. **Reachability** — free to run, free to fork, free to modify. The default build ships no mandatory paywall.