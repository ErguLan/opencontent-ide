# Plugin System (`src/plugins/`)

## Architecture

A **hook-based extension framework**. Plugins register callbacks on named hooks; the application runs those hooks at specific points.

```
PluginManager
    ↓
register(plugin)              →  plugin.register(manager)
                                         ↓
                              manager.addHook(hookName, handler)
    ↓
Application calls manager.runHookSync(hookName, context)
```

`register()` throws on a plugin without a `name` and silently ignores a duplicate name, logging `Plugin '<name>' is already registered`.

## PluginManager API

| Method | Behavior |
|--------|----------|
| `register(plugin)` | Stores the plugin and calls `plugin.register(this)`. A plugin without a `name` throws `Plugin must have a name`; a duplicate name is skipped with `Plugin '<name>' is already registered`. |
| `addHook(hookName, handler)` | Appends a handler and returns `this`. An unknown hook name is created on the fly. |
| `runHook(name, context)` | Async pipeline. Resolves with the last non-`undefined` return value. |
| `runHookSync(name, context)` | Same contract, synchronous. |
| `getPlugins()` | Copy of the registered plugin list. |
| `getHookHandlers(name)` | Copy of the handler array. |
| `getDefaultPluginManager()` | Process-wide singleton. |

Both runners wrap each handler in `try/catch`, log `Plugin hook '<name>' failed:` and continue with the previous value. A throwing handler degrades the extension point; it does not break the app. A handler that returns `undefined` passes the value through unchanged, so a handler that only observes does not need to return anything.

`runHookSync` is safe to call during render or from an input handler, which is why the CLI uses it to build its command table once. `runHook` returns a promise and must not be used in a synchronous render path.

## Hooks

| Constant | Value | Trigger | Context shape |
|----------|-------|---------|---------------|
| `WORKSPACE_TOOLBAR` | `workspace.toolbar` | Workspace toolbar render | Array of `{ label, icon, action }` |
| `WORKSPACE_CANVAS_AFTER` | `workspace.canvas.after` | After the canvas renders | Canvas context |
| `CLI_COMMAND` | `cli.command` | CLI initialization | Array of command objects |
| `SETTINGS_PANEL` | `settings.panel` | Settings page render | Array of setting sections |
| `GENERATION_BEFORE` | `generation.before` | Before AI generation | `{ prompt, model, options }` |
| `GENERATION_AFTER` | `generation.after` | After AI generation | `{ response, prompt, model }` |
| `ARTIFACT_IMPORT` | `artifact.import` | Artifact import | Artifact payload |
| `ARTIFACT_EXPORT` | `artifact.export` | Artifact export | Artifact payload |
| `ARTIFACT_RENDER` | `artifact.render` | Artifact render | Artifact payload |
| `ARTIFACT_OPERATION_BEFORE` | `artifact.operation.before` | Before an artifact operation | Operation |
| `ARTIFACT_OPERATION_AFTER` | `artifact.operation.after` | After an artifact operation | Operation |
| `DIAGRAM_SYMBOL_PROVIDER` | `diagram.symbol.provider` | Diagram symbol resolution | Symbol request |
| `PDF_PROCESSOR` | `pdf.processor` | PDF import/export processing | PDF payload |

## Wiring Status — read this before writing a plugin

`HOOKS` declares thirteen hooks. **Only `CLI_COMMAND` has an application call site.** It is run in `src/features/cli/useCli.js`:

```js
createBuiltinCommands(context).forEach((command) => instance.register(command));
const pluginCommands = manager.runHookSync(HOOKS.CLI_COMMAND, []);
pluginCommands.forEach((command) => instance.register(command));
```

The other twelve accept registrations and are covered by `PluginManager.test.js`, but no application code runs them. Registering on them today has no effect on behavior. They are declared extension points, not working instrumentation.

This matters most for the AI artifact pipeline: `ARTIFACT_OPERATION_BEFORE` / `AFTER` sound like they gate artifact edits, and they do not. `src/services/artifacts/aiArtifactOps.js` enforces its own allowlist and argument validation, and `ArtifactStudio.jsx` applies the result directly. If you need artifact policy, that allowlist is the enforced path today.

## Built-in Plugins

Registered in `src/plugins/index.js`:

| Plugin | Registers |
|--------|-----------|
| `builtIn/hello.js` | `CLI_COMMAND` — a `hello` command. The reference example. |
| `builtIn/artifacts.js` | `WORKSPACE_TOOLBAR`, `CLI_COMMAND` (`artifact`, `diagram`, `document`), `ARTIFACT_IMPORT`, `ARTIFACT_EXPORT`, `ARTIFACT_OPERATION_BEFORE`, `ARTIFACT_OPERATION_AFTER` |

`src/plugins/index.js` also exports `manager` and `getDefaultPluginManager`. Import `manager` from there to register hooks; nothing else instantiates the manager, so importing the module is what activates the built-ins.

## Writing a Plugin

```js
// src/plugins/builtIn/hello.js
export default {
    name: 'hello',
    version: '1.0.0',
    register(manager) {
        manager.addHook(HOOKS.CLI_COMMAND, (registry) => [
            ...registry,
            {
                name: 'hello',
                description: 'Say hello from a plugin',
                usage: 'hello [name]',
                argHints: ['world'],
                run: ({ args }) => ({
                    type: 'success',
                    message: `Hello from plugin, ${args[0] || 'world'}!`
                })
            }
        ]);
    }
};
```

Then register it in `src/plugins/index.js`:

```js
import myPlugin from './builtIn/myPlugin.js';
manager.register(myPlugin);
```

## Rules

- Import `HOOKS` from `src/plugins`. Do not hardcode hook strings; they are the identifiers the manager keys on.
- A sync hook runs in a render or input path. Keep it cheap and never make it async.
- Return the modified context so the next handler receives it. Do not mutate in place.
- Catch your own errors. The manager catches them too, but only logs them.
- Guard every hook you register on. On the twelve unwired hooks, guard against being called at all.