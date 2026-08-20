# AGENTS.md — OpenContent IDE

## About this project

OpenContent IDE is an open-source, self-hosted, AI-powered content creation studio originally built by Yoll and donated to the community. It is designed to be local-first, BYOK (Bring Your Own Key), and extensible through plugins, skills, and custom AI providers.

This file contains the context and conventions that coding agents need when working on the codebase.

## Core principles

- **Local-first**: All data lives in the browser (IndexedDB / localStorage). No server is required for normal use.
- **BYOK**: Users provide their own API keys. The project does not ship with bundled AI access.
- **Optional SaaS / login**: The codebase includes optional freemium hooks and a login placeholder for forks that want to add real auth. These are hidden by default.
- **Open source**: MIT licensed. Contributions welcome.
- **No emojis in code or UI**: Use SVG icons from `/public/icons/` or generate PNG/SVG assets with Python scripts.
- **Custom CSS class names**: Avoid generic class names like `.button`, `.text`, `.card`. Use prefixed/project-specific names to avoid collisions.
- **i18n for all user-facing text**: Use the translation system. No hardcoded user-facing strings in components.
- **English code, translated UI**: Source code, comments, variable names, and file names are in English. User-facing strings are translated through `src/i18n/`.

## Tech stack

- React 19 + Vite 7
- React Router DOM 7
- Vanilla CSS with variables (`src/styles/variables.css`)
- IndexedDB for projects and media
- localStorage for settings and keys
- Express server (optional, `server/`)
- MCP server (optional, `mcp/`)

## Important files

- `src/config/constants.js` — App constants, feature flags, routes, storage keys.
- `src/services/ai/index.js` — AI provider abstraction.
- `src/services/providers/` — Provider implementations (OpenRouter, OpenAI, Google, Anthropic, Ollama).
- `src/services/models/` — Model registry and user-defined models.
- `src/context/AuthContext.jsx` — Local user by default; optional real auth for forks.
- `src/i18n/` — Translation JSON files.
- `src/data/skills.json` — AI personas/skills.
- `src/data/quickPrompts.js` — Template starters.
- `docs/TRANSLATION_SYSTEM.md` — How to add or modify translations.
- `docs/ARCHITECTURE.md` — System architecture.
- `docs/ROADMAP.md` — Planned work and current phase.

## Conventions

### CSS

- Use CSS variables from `src/styles/variables.css`.
- Prefer component-specific class names like `.oc-workspace-toolbar`, `.oc-button-primary`.
- No Tailwind, no CSS-in-JS.

### Icons / assets

- Use the `Icon` component with SVG paths defined in `src/components/icons/Icon.jsx`.
- If a new icon is needed, generate an SVG or use a Python script to generate a PNG.
- Never paste emoji characters into source files.

### Translations

- All user-facing strings must use the `useLanguage()` hook and `t('key')`.
- Add new keys to both `src/i18n/en.json` and `src/i18n/es.json`.
- Keep keys organized by feature/section.
- See `docs/TRANSLATION_SYSTEM.md` for the full convention.

### Components

- Keep components focused and small.
- Move reusable logic into hooks under `src/features/<feature>/hooks/` or `src/hooks/`.
- Use `components/common/` for shared UI primitives.

### AI providers

- Providers are self-contained modules that expose a consistent interface.
- The frontend asks for a model by ID; the provider layer resolves how to call it.
- Users can add custom model IDs with optional nickname, provider, and capabilities.

### Auth

- Default user is local with full access.
- Real authentication is optional and must be explicitly enabled by a fork.
- Do not introduce mandatory external auth providers.

## What to avoid

- Hardcoded Spanish or English strings in JSX.
- Emoji in code or UI.
- Generic CSS class names.
- Hardcoded model IDs outside of provider/model configuration files.
- Mandatory paywalls in the default open-source build.

## Brand note

OpenContent IDE was donated by Yoll to the open-source community. The project should remain neutral and not depend on Yoll-specific services or branding, but it is fine to mention the donation in the About section and docs.
