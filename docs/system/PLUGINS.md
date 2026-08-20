# Plugin System (`src/plugins/`)

## Architecture

The plugin system is a **hook-based extension framework**. Plugins register callbacks on named hooks, and the application calls those hooks at specific points.

```
PluginManager
    ↓
register(plugin) → plugin.register(manager)
    ↓                      ↓
                    manager.addHook(hookName, handler)
    ↓                      ↓
Application calls   manager.runHook(hookName, context)
```

## PluginManager API

### `register(plugin)`
Register a plugin. Plugin must have a `name` and optional `register(manager)` function. Duplicate names are silently ignored.

### `addHook(hookName, handler)`
Add a handler function to a hook. Multiple handlers can be added to the same hook — they run in registration order.

### `runHook(hookName, context)` / `runHookSync(hookName, context)`
Execute all handlers for a hook. Each handler receives the result of the previous handler (pipeline pattern). Async handlers use `runHook`, sync handlers use `runHookSync`.

```js
// Example: plugin adds a CLI command
manager.addHook(HOOKS.CLI_COMMAND, (commands) => {
    commands.push({
        name: 'hello',
        description: 'Say hello',
        run: () => ({ type: 'success', message: 'Hello!' })
    });
    return commands;
});
```

## Available Hooks

| Hook Name | Trigger Point | Context | Expected Return |
|-----------|--------------|---------|-----------------|
| `WORKSPACE_TOOLBAR` | Toolbar render in workspace | Array of toolbar items | Array with item objects: `{ label, icon, action }` |
| `CLI_COMMAND` | CLI initialization | Array of command objects | Array with command objects |
| `GENERATION_BEFORE` | Before AI generation | `{ prompt, model, options }` | Modified `{ prompt, model, options }` |
| `GENERATION_AFTER` | After AI generation | `{ response, prompt, model }` | Modified response |
| `SETTINGS_PANEL` | Settings page render | Array of setting sections | Array with section objects |

## Creating a Plugin

```js
// src/plugins/builtIn/hello.js
export default {
    name: 'hello',
    version: '1.0.0',
    register(manager) {
        manager.addHook('cli.command', (registry) => {
            registry.push({
                name: 'hello',
                description: 'Say hello from a plugin',
                usage: 'hello [name]',
                run: ({ args }) => ({
                    type: 'success',
                    message: `Hello from plugin, ${args[0] || 'world'}!`
                })
            });
            return registry;
        });
    }
};
```

## Registering a Plugin

```js
// src/plugins/index.js
import { getDefaultPluginManager } from './PluginManager.js';
import helloPlugin from './builtIn/hello.js';

const manager = getDefaultPluginManager();
manager.register(helloPlugin);
```

## Hooks Connected to the Workspace

The workspace toolbar runs plugin hooks during render:

```jsx
{manager.runHookSync(HOOKS.WORKSPACE_TOOLBAR, []).map((item, i) => (
    <Tooltip key={i} content={item.label || ''}>
        <button onClick={() => item.action?.()}>
            {item.icon || null}
        </button>
    </Tooltip>
))}
```

## Best Practices

- Keep handlers lightweight — they run synchronously in the render path
- Return the modified context to pass to the next handler
- Don't mutate the context directly — return a new object
- Catch errors inside handlers to avoid breaking the pipeline
