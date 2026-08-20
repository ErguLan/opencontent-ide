# Contributing to OpenContent IDE

Thanks for your interest in contributing!

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/opencontent-ide.git`
3. Install dependencies: `npm install`
4. Copy `.env.example` to `.env` and add your API keys
5. Run the dev server: `npm run dev`

## Code Style

- Use **vanilla CSS** (no Tailwind, no CSS-in-JS)
- Use **prefixed class names** (`.oc-*`, `.cli-*`, `.agentic-*`) to avoid collisions
- Use CSS variables from `src/styles/variables.css`
- Keep components focused and small
- **No emojis** in UI (use the `Icon` component with SVG paths instead)
- Source code in English, UI text through `src/i18n/`

## Project Structure

```
src/
  config/          — Constants, feature flags, routes, storage keys
  context/         — React contexts (Auth, Theme, Language)
  features/        — Page components (Landing, Workspace, Settings, Auth, CLI)
    workspace/
      hooks/       — useWorkspaceAI, useWorkspaceMedia, useWorkspaceProjects
      components/  — MediaPanel, ChatInput, WorkspaceCanvas, etc.
    cli/           — CliEngine, commands, CliPage, useCli
  components/      — Shared UI (Button, Modal, Icon, ModelSelector, CommandPalette)
  services/
    providers/     — One module per AI provider (openrouter, openai, google, anthropic, ollama)
    models/        — Model registry and custom-model helpers
    ai/            — Unified provider dispatch
    projectsLocal, mediaService, copyAsApi, freemium, metrics
  i18n/            — Translation JSON files (en.json, es.json)
  plugins/         — Plugin system (PluginManager, builtIn/)
  test/            — Test setup and utilities
```

## AI Provider Architecture

Each provider is a self-contained module in `src/services/providers/`. They expose:

- `send(prompt, model, options)` — text/chat generation
- `generateImage(prompt, model, options)` — image generation
- `analyzeImage(imageUrl, prompt, options)` — vision analysis

Providers are resolved by the model registry (`src/services/models/`). Each model has a `provider` field that maps to the module name.

To add a new provider:
1. Create `src/services/providers/yourprovider.js` following the pattern
2. Add the provider key to `PROVIDERS` in `src/services/models/index.js`
3. Import and map it in `src/services/ai/index.js`

## Model Registry

Models are stored in localStorage. There are no built-in defaults — users add their own via Settings.

- `getStoredModels()` — returns all models
- `addModel(model)` — adds a custom model
- `resolveModel(id)` — looks up by ID, falls back to generic OpenRouter model
- `supportsVision(id)` / `supportsImageGeneration(id)` — capability checks

Run `npm test` to verify model operations.

## i18n / Translations

All user-facing strings go through `useLanguage()` and `t('key')`.

- Add keys to both `src/i18n/en.json` and `src/i18n/es.json`
- Keep keys organized by feature/section
- Use dot notation for nesting: `workspace.actions.save`
- Variable interpolation: `t('key', { varName: value })` with `{varName}` in the JSON string

## CLI

The CLI at `/cli` uses a command engine (`CliEngine`) with:

- **Commands** defined in `src/features/cli/commands.js` (or via plugins)
- **Parser** with quoted arguments and `--flag` support
- **Autocomplete** via Tab
- **History** persisted to localStorage

To add a CLI command:

```js
engine.register({
    name: 'mycommand',
    description: 'What it does',
    usage: 'mycommand [arg]',
    argHints: ['hint1', 'hint2'], // for autocomplete
    run: ({ args, flags, context }) => {
        return { type: 'success', message: 'Done' };
    }
});
```

## Plugin System

Plugins hook into lifecycle events. See `src/plugins/PluginManager.js` for available hooks.

```js
export default {
    name: 'my-plugin',
    version: '1.0.0',
    register(manager) {
        manager.addHook('cli.command', (registry) => {
            registry.push({ name: 'mycmd', run: () => ({ message: 'hi' }) });
            return registry;
        });
    }
};
```

Register plugins in `src/plugins/index.js`.

## Testing

- Tests use **Vitest** with jsdom environment
- Run: `npm test` or `npm run test:watch`
- New tests go next to the module as `*.test.js`
- Unit tests for services and utilities, component tests with React Testing Library

## Pull Requests

- Create a feature branch from `main`
- Run `npm run lint` and `npm test` before submitting
- Write clear commit messages
- Keep PRs focused on a single feature or fix

## Reporting Issues

Use GitHub Issues. Include:
- Steps to reproduce
- Expected vs actual behavior
- Browser and OS info
- Console errors (if any)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
