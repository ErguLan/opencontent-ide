# CLI Engine (`src/features/cli/`)

## Overview

The CLI has two modes:

1. **In-browser CLI** — React route at `/cli`. Full terminal UI with command engine.
2. **Standalone CLI** — Node.js process at `cli/index.js`. Connects to the API server for AI generation.

## CliEngine (`CliEngine.js`)

The core command engine. Pure logic, no React dependency.

### Registration

```js
const engine = new CliEngine(context);
engine.register({
    name: 'mycommand',
    aliases: ['mc'],
    description: 'Does something',
    usage: 'mycommand [arg]',
    argHints: ['hint1', 'hint2'],  // for Tab autocomplete
    hidden: false,
    run: ({ args, flags, raw, engine, context }) => {
        // args = positional arguments
        // flags = { --key: value }
        // raw = original input string
        return { type: 'success', message: 'Done' };
    }
});
```

### Command Parser

The `parse(input)` method tokenizes input with:
- **Quoted strings**: `"hello world"` or `'hello world'` → single token
- **Flags**: `--key value` or `--boolean-flag`
- **Escaped quotes**: `\"` inside quoted strings

Returns `{ command, args, flags }`.

### Autocomplete

`autocomplete(input)` returns matching command names or argument hints:
- If input matches a command and ends with space, returns `argHints`
- Otherwise returns command names that start with the input

Triggered by Tab key in the terminal.

### Execution

`execute(input)`:
1. Parses input
2. Looks up command by name (including aliases)
3. Calls `command.run()`
4. Catches errors and returns `{ type: 'error', message }`
5. Records input in `this.history`

## Built-in Commands (`commands.js`)

| Command | Description | Requires |
|---------|-------------|----------|
| `help [cmd]` | List commands or show help for one | — |
| `clear` | Clear terminal output | — |
| `theme [dark\|light]` | Toggle or set theme | `setTheme`, `toggleTheme` |
| `lang [es\|en]` | Show or set language | `changeLanguage` |
| `goto <page>` | Navigate to a route | `navigate` |
| `model [text\|image] [id]` | Show or set active model | `getActiveTextModel`, `setActiveModels` |
| `generate <prompt>` | Generate AI text directly in CLI | `sendToAI` |
| `gallery [list\|view\|clone\|delete]` | Browse media assets and clone copies without removing gallery originals | `getAllMedia`, `executeAgentTool`, `deleteMedia` |
| `project [list\|open\|delete\|new]` | Manage projects | `getLocalProjects`, `saveLocalProject` |
| `exit` | Go to landing page | `navigate` |

### `generate` Command Flow

```
generate "write a poem about AI"
    ↓
sendToAI(prompt, getActiveTextModel())
    ↓
saveLocalProject({ name, prompt, result })  ← auto-create project
    ↓
Display response inline in terminal
    ↓
If --image flag: append "[Image generated in gallery]"
```

No redirect to workspace — everything happens inline in the CLI.

## Standalone CLI (`cli/index.js`)

Runs as a Node.js process:

```bash
node cli/index.js
```

Filesystem gallery commands use `OC_GALLERY_DIR` (default: `./gallery`). Cloning requires `OC_ALLOW_LOCAL_WRITES=true` and writes only to `OC_OUTPUT_DIR` or directories listed in `OC_ALLOWED_CLONE_DIRS`. Existing destination files are protected unless `OC_ALLOW_OVERWRITE=true`.

**Requires the API server** to be running (`npm run server:start`) because it forwards generation requests via HTTP:

```
stdin → parse → http POST /api/generate → stdout
```

### Commands (standalone)

| Command | Description |
|---------|-------------|
| `help` | List commands |
| `model list\|set <id>` | List or set the active model |
| `generate <prompt>` | Generate via API server |
| `project list` | List projects |
| `clear` | Clear screen |
| `exit` | Quit |

### IPC Bridge Concept

For open-sourcing, the standalone CLI could communicate with the React app via:
- **stdin/stdout** — JSON-RPC messages
- **HTTP** — Local API server (current approach)
- **WebSocket** — Real-time bidirectional communication

## Terminal UI (`CliTerminal.jsx`)

Classic terminal look:
- Black background (`#0a0a0a`)
- Green prompt (`#00ff41`)
- Monospace font (Consolas / Courier New)
- Scrollable output area
- Input field at the bottom (no separate bar)
- Auto-scroll to bottom on new output
