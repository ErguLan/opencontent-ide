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
- Text, vision and image generation through multiple providers.
- **Streaming responses** for supported providers.
- Skills/personas and project chat memory.
- Media library and generated-image history.
- **Artifact Studio** for diagrams, editable documents and non-destructive PDF workflows.
- Structured diagram editor + SVG export.
- Editable document model + PDF export.
- Imported PDFs preserve the original binary; OpenContent annotations currently live in a separate edit layer and are not silently embedded into the source PDF.
- AI artifact changes are proposed as structured operations before they are applied.
- Versioned artifact operations with Undo/Redo foundations.
- Browser CLI at `/cli` with plugins and autocomplete.
- Standalone Node.js CLI with one-shot/script mode and interactive shell.
- REST API and OpenAI-compatible chat endpoint.
- MCP tool provider.
- Hook-based plugin system.
- Dark/light mode, EN/ES i18n, Docker and PWA support.
- Optional Rust/WASM `oc-core` for deterministic artifact operations.

## Quick start

```bash
git clone https://github.com/ErguLan/opencontent-ide.git
cd opencontent-ide
npm install
npm run dev
```

Open `http://localhost:5173`.

Then open **Settings** and:

1. Add a provider/API key or configure a local/custom provider.
2. Register the exact model IDs you want to use.
3. Mark their capabilities (`text`, `vision`, `imageGeneration`, tools, etc.).
4. Explicitly choose active text/vision/image models when needed.

OpenContent does not pick a default GPT, Gemini, Seedream or any other vendor model for you.

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

For imported PDFs, the UI intentionally says **Download original** until OpenContent can embed the edit layer into a newly rendered PDF. This avoids implying that annotations have modified the source binary when they have not.

See [docs/system/ARTIFACTS.md](docs/system/ARTIFACTS.md).

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

| Provider | Text | Images | Local | Notes |
| --- | --- | --- | --- | --- |
| OpenRouter | Yes | Model-dependent | No | BYOK |
| OpenAI | Yes | Yes | No | BYOK |
| Google | Yes | Model-dependent | No | BYOK |
| Anthropic | Yes | No | No | BYOK |
| Ollama | Yes | Model-dependent | Yes | User-managed local models |
| Custom OpenAI-compatible | Capability-dependent | Capability-dependent | Depends | User-supplied base URL |

Capabilities are determined by the model records the user registers; OpenContent intentionally avoids shipping a vendor model catalog as a source of implicit defaults.

## Storage and privacy

Browser mode uses:

- IndexedDB for projects/media/artifacts.
- localStorage for preferences, model registry and BYOK configuration.

“Local-first” describes OpenContent storage. Inference is only fully local when the selected provider/infrastructure is local; using a hosted provider sends the requested inference data to that provider.

## Rust / WASM core

The optional deterministic core lives under:

```text
rust/oc-core
```

Run:

```bash
npm run rust:check
npm run rust:test
```

The frontend can use the WASM build when present and fall back to JavaScript validation when it is not built.

## Development

```bash
npm run dev
npm test
npm run lint
npm run build
```

Main project areas:

```text
src/       React/Vite frontend
server/    optional Express API
cli/       standalone Node CLI
mcp/       MCP providers
rust/      deterministic Rust/WASM core
docs/      architecture and system docs
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md).

## License

MIT — see [LICENSE](LICENSE).
