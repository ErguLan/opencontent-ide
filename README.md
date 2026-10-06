# OpenContent IDE

[![CI](https://github.com/ErguLan/opencontent-ide/actions/workflows/ci.yml/badge.svg)](https://github.com/ErguLan/opencontent-ide/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-green.svg)](https://nodejs.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

> Open-source creative AI workspace. Self-hosted. BYOK. Local-first.

**OpenContent IDE** is a local-first, open-source workspace for AI-assisted content, images, diagrams and documents. Bring your own providers and model IDs, or use local inference. Browser data stays local by default.

## Product principles

- **No forced model choices** — the model registry starts empty. OpenContent never injects or auto-selects vendor model IDs.
- **BYOK** — configure OpenRouter, OpenAI, Google, Anthropic, Ollama or a custom OpenAI-compatible provider.
- **Local-first** — projects, media and artifacts are stored in the browser by default.
- **Model-agnostic** — capabilities are attached to user-registered models instead of hardcoding product assumptions around one vendor.
- **Multiple interfaces, one product** — Workspace, browser CLI, standalone CLI, API, MCP and plugins share the same concepts.

## Features

- User-managed **Model Registry** with provider and capability tags.
- **Model discovery with your own key** — OpenContent asks your provider which models your credentials can reach. No bundled catalog, and no fallback list when a provider cannot be listed.
- Three-step AI setup at `/setup`: choose provider, paste credentials, discover and pick a model.
- Text, vision and image generation through multiple providers.
- **Streaming responses** for supported providers.
- Skills/personas and project chat memory.
- Media library and generated-image history.
- **Artifact Studio** for diagrams, editable documents and non-destructive PDF workflows.
- Structured diagram editor + SVG export.
- Editable document model + PDF export.
- Imported PDFs preserve the original binary; OpenContent annotations currently live in a separate edit layer and are not silently embedded into the source PDF.
- AI artifact changes are proposed as structured operations before they are applied.
- Versioned artifact operations with Undo/Redo.
- **Delivery states** for media and artifacts: `draft -> in-review -> approved -> published`, with a terminal published state.
- Unified **Library** with kind filters and delivery-state filters.
- Browser CLI at `/cli` with plugins, suggestions and local history.
- Standalone Node.js CLI with one-shot/script mode and interactive shell.
- REST API and OpenAI-compatible chat endpoint.
- MCP tool provider.
- Hook-based plugin system.
- Dark/light mode, EN/ES i18n, Docker and a PWA manifest/service worker.
- Deterministic in-browser validation for every AI artifact operation before it is applied.

## Quick start

```bash
git clone https://github.com/ErguLan/opencontent-ide.git
cd opencontent-ide
npm install
npm run dev
```

Open `http://localhost:5173`.

Then open **Setup** (`/setup`), which walks through three steps:

1. Choose a provider.
2. Paste your credentials. Keys are stored in this browser's localStorage only — nothing is sent anywhere by OpenContent itself.
3. Discover the models your key can reach and choose one. If the provider cannot be listed, or listing fails, you can type the model ID by hand.

You can also register models manually in **Settings**, tagging their capabilities (`text`, `vision`, `imageGeneration`, tools, etc.) and explicitly choosing the active text/vision/image models.

OpenContent does not pick a model for you. The registry starts empty and stays that way until you fill it.

## Local inference with Ollama

Ollama is supported as one provider option. Register an Ollama model in Settings and optionally configure its base URL. The runtime fallback URL is `http://localhost:11434`, but merely having that fallback does **not** make OpenContent treat AI as configured; a model must be registered by the user.

Example:

```bash
ollama pull llama3
```

Then register `llama3` as an Ollama text model in OpenContent.

## Artifact Studio

Open `/artifacts` from the Workspace toolbar.

Current artifact types:

- **Diagram** — structured nodes/connectors, drag editing, DSL input, auto layout and SVG export.
- **Document** — page/block representation, manual text editing, AI generation and PDF export.
- **PDF** — immutable uploaded original plus a separate OpenContent annotation/edit layer.

Each artifact has an addressable route:

```text
/artifacts/<artifact-id>
```

Every artifact operation, including a delivery-state change, goes through the same operation log: it is versioned and undoable like any other edit.

For imported PDFs, the UI intentionally says **Download original** until OpenContent can embed the edit layer into a newly rendered PDF. This avoids implying that annotations have modified the source binary when they have not.

See [docs/system/ARTIFACTS.md](docs/system/ARTIFACTS.md).

## Delivery states

A piece of content is not finished when it is generated. OpenContent tracks that lifecycle explicitly:

```text
draft -> in-review -> approved -> published
```

- Transitions only move forward. No jumps, no skips, no going back.
- `published` is terminal. To change a published piece, create a new version of it.
- For artifacts the transition is a normal, undoable artifact operation. For media assets it is the asset `status`, validated by the same machine.
- Artifact Studio shows a delivery panel; the Library filters media and artifacts by delivery state, including a "needs review" view.

See [docs/system/DELIVERY.md](docs/system/DELIVERY.md).

## Browser CLI

Open `/cli`.

The browser CLI has command/argument suggestions, persistent local history, typo suggestions and plugin-provided commands such as:

```text
model
project
gallery
artifact
diagram
document
generate
agent
```

`artifact`, `diagram` and `document` come from the built-in artifact plugin; the rest are built into the CLI engine.

Destructive browser-CLI operations require explicit `--force` where supported.

## Standalone CLI

Node.js 20+ is required.

```bash
npm run cli
```

or, after linking/installing the package:

```bash
opencontent
# alias
oc
```

With no arguments it opens the interactive shell. Commands can also run directly for scripts/CI:

```bash
opencontent status
opencontent doctor
opencontent generate "Draft a launch announcement"
opencontent diagram "User -> API; API -> Database" -o architecture.svg
opencontent document "Quarterly report" -o report.pdf
opencontent pdf create "Executive summary" -o summary.pdf
```

Useful global flags:

```text
--api <url>   override OC_API_URL
--json        structured output
--quiet       suppress progress
--verbose     diagnostic logging
--help        command help
--version     CLI version
```

Remote API calls use the Node 20 Fetch API, so both `http://` and `https://` `OC_API_URL` values are supported.

`opencontent doctor` checks remote API reachability, latency, model registry state and active model selection.

## API server

```bash
npm run server:install
npm run server:start
```

Core endpoints include:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/api/generate` | Generate text |
| POST | `/api/generate-image` | Generate an image |
| GET | `/api/models` | List models exposed by the API server |
| GET | `/api/health` | Health check |
| POST | `/api/artifacts/operate` | Apply structured artifact operations |
| POST | `/api/artifacts/diagram` | Create/render a diagram |
| POST | `/api/artifacts/document` | Create a document representation |
| POST | `/api/artifacts/pdf/render` | Render an OpenContent document as PDF |
| POST | `/v1/chat/completions` | OpenAI-compatible chat endpoint |

## MCP

Start the main MCP provider:

```bash
npm run mcp:start
```

Artifact-focused MCP tooling is also available:

```bash
npm run mcp:artifacts
```

The MCP layer is designed so agents can generate/inspect content and artifacts without making the browser UI the only integration surface.

## Providers

| Provider | Text | Images | Local | Model listing | Notes |
| --- | --- | --- | --- | --- | --- |
| OpenRouter | Yes | Model-dependent | No | Yes | BYOK |
| OpenAI | Yes | Yes | No | Yes | BYOK |
| Google | Yes | Model-dependent | No | Yes, paginated | BYOK |
| Anthropic | Yes | No | No | Yes, paginated | BYOK |
| Ollama | Yes | Model-dependent | Yes | Yes | User-managed local models |
| Custom OpenAI-compatible | Capability-dependent | Capability-dependent | Depends | Reported as unsupported | User-supplied base URL |

Capabilities are determined by the model records the user registers; OpenContent intentionally avoids shipping a vendor model catalog as a source of implicit defaults.

See [docs/system/AI_PROVIDERS.md](docs/system/AI_PROVIDERS.md) and [docs/system/MODEL_REGISTRY.md](docs/system/MODEL_REGISTRY.md).

## Storage and privacy

Browser mode uses:

- One IndexedDB database, `OpenContentDB`, holding the `projects`, `user-assets` and `artifacts` stores.
- localStorage for preferences, model registry and BYOK configuration.

Data written by earlier versions is migrated on first run from the previous per-domain databases and from the legacy `oc_local_projects` key. The migration only removes a legacy source after every record has been committed, so an interrupted migration retries instead of losing data.

"Local-first" describes OpenContent storage. Inference is only fully local when the selected provider/infrastructure is local; using a hosted provider sends the requested inference data to that provider.

## Deterministic validation

AI artifact operations are validated in JavaScript, in the browser, before they can touch an artifact. The planner only emits actions from a fixed allowlist, and every operation is type-checked against the action it claims to be. There is no native build step and no optional backend required for validation to work.

## Development

```bash
npm run dev
npm test
npm run lint
npm run build
```

Main project areas:

```text
src/        React/Vite frontend
  components/  shared UI primitives, icons, command palette
  config/      constants, routes, storage keys
  context/     auth, language, theme providers
  data/        skills and quick prompts
  features/    landing, workspace, setup, settings, library, gallery, artifacts, cli, auth
  i18n/        translation tree (en/es + artifact/ux modules)
  plugins/     plugin manager and built-in plugins
  services/    ai, artifacts, db, delivery, models, providers
  test/        test setup and the in-memory IndexedDB double
server/     optional Express API
cli/        standalone Node CLI
mcp/        MCP providers
docs/       architecture, roadmap, translation system, per-system docs
public/     icons, PWA manifest, service worker
```

## Known limitations

- Imported PDF annotations are kept in a separate edit layer and are not written back into the original PDF binary.
- `index.html` and the PWA files reference `/brand/*` assets (favicon, install icons) that are not present in the repository, so install icons and service-worker pre-caching are incomplete.
- The API server's `/api/health` response reports a fixed version string that does not track `package.json`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Roadmap

[docs/ROADMAP.md](docs/ROADMAP.md) is a planning document. Treat its items as plan, not as shipped features; the sections above describe what the code does today.

## License

MIT — see [LICENSE](LICENSE).