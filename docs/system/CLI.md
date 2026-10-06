# CLI Engine (`src/features/cli/`)

## Overview

The CLI has two modes:

1. **In-browser CLI** — React route at `/cli`, a terminal UI over `CliEngine`.
2. **Standalone CLI** — Node.js processes at `cli/index.js` and `cli/artifacts.js`. They forward generation to the Express API.

## CliEngine (`CliEngine.js`)

Pure logic, no React. Holds a `Map` of commands, a `history` array and the injected `context`.

### `register(command)`

```js
const engine = new CliEngine(context);
engine.register({
    name: 'mycommand',
    aliases: ['mc'],
    description: 'Does something',
    usage: 'mycommand [arg]',
    category: 'general',
    argHints: ['hint1', 'hint2'],
    hidden: false,
    run: ({ args, flags, raw, engine, context }) => ({ type: 'success', message: 'Done' })
});
```

Aliases are registered as additional keys pointing at the same command object. A command without a `name` throws.

### `parse(input)`

Tokenizes on spaces and tabs, honoring `"` and `'` quotes with `\` escapes, then splits into:

- `--key value` → `flags.key = 'value'` (the value is consumed only if the next token does not start with `--`)
- `--flag` alone → `flags.flag = true`
- the first token → `command`, remaining tokens → `args`

### `execute(input)`

1. Parse
2. Resolve the command by name or alias
3. `await command.run(...)`
4. Catch any throw and return `{ type: 'error', message }`
5. Push `{ input, timestamp }` onto `this.history`

### `autocomplete(input)`

- If the input matches a command and ends with a space, returns that command's `argHints`, minus hints already present in `args`.
- Otherwise returns visible command names ranked by Levenshtein distance.

Hidden commands are excluded from autocomplete and from help.

`suggestCommand(input)` returns the closest command name when the distance is at most `max(2, floor(input.length / 2))`, otherwise `null`. That is what turns an unknown command into a suggestion instead of a bare error.

## Terminal UI

`CliPage.jsx` owns `useCli`, `CliTerminal.jsx` renders it.

- Context bar at the top: active text, vision and image models.
- Scrollable output, one line per result, typed by result `type` (`command`, `success`, `error`, `warning`, `banner`, `info`).
- Suggestions appear inline as you type; `Tab` accepts the highlighted one, `ArrowUp`/`ArrowDown` move, `Escape` dismisses.
- With no suggestions open, `ArrowUp`/`ArrowDown` walk the stored history.
- History is `localStorage` key `oc_cli_history`, last 100 entries, persisted by `useCli`.
- Clicking anywhere in the terminal focuses the input.

`GlobalCommandPalette` (Ctrl/Cmd+K, also `` ` `` and `,`) is a separate surface that also surfaces `/setup` and `/library`.

## Built-in Commands (`commands.js`)

Registered through `createBuiltinCommands(context)`. Context supplies `navigate`, `toggleTheme`, `setTheme`, `changeLanguage`, `t`.

| Command | Category | Purpose |
|---------|----------|---------|
| `help [command]` | general | List commands, or detail one |
| `clear` | general | Clear the output |
| `theme [dark\|light]` | config | Toggle or set the theme |
| `lang [en\|es]` | config | Show or set the language |
| `goto <page>` | navigation | Navigate to landing, workspace, settings, cli, gallery or artifacts |
| `model [list\|add\|set\|clear]` | config | Inspect and change the model registry and the active selections |
| `generate <prompt> [--image]` | content | Generate inline; `--image` also requests a visual |
| `agent <prompt>` | content | Run the agentic pipeline headless (steps and chunks are discarded) |
| `gallery [list\|view\|clone\|delete]` | assets | Browse and clone image assets |
| `project [list\|open\|delete\|new]` | projects | Manage projects |
| `exit` | navigation | Back to the landing page |

`artifact`, `diagram` and `document` are **not** in this table because they are not built in: they are added by the built-in artifact plugin through `HOOKS.CLI_COMMAND`, which `useCli` runs immediately after the built-ins are registered.

`generate <prompt>` creates a project, calls `sendToAI` directly and prints the result inline. With `--image` it also generates a visual through the active image model and prints the resulting asset ID. There is no redirect to the workspace. If no text model is selected it returns an error naming the fix (`model set text <id>`) rather than calling a provider.

## Standalone CLI (`cli/index.js`, `cli/artifacts.js`)

Node.js processes. Generation is forwarded over HTTP to the Express API, so the server must be running:

```
stdin -> parse -> http POST /api/generate -> stdout
```

Its command set is **not** the browser set:

| Command | Purpose |
|---------|---------|
| `help` | List commands |
| `status` | Default action. Reports server reachability and configured providers |
| `doctor` | Diagnostic checks |
| `model list\|set <id>` | Inspect and set the active model |
| `generate <prompt>` | Text generation |
| `ask-editor <prompt>` | Generation with an editor-oriented context |
| `image <prompt>` | Image generation |
| `agent <prompt>` | Agentic pipeline |
| `gallery …` | Filesystem gallery operations |
| `diagram …`, `document …`, `pdf create …` | Artifact operations on files |
| `artifact` | Explains that browser artifacts are IndexedDB-local and points at the alternatives |
| `project` | Explains that browser projects are IndexedDB-local; remote generations sync through `/api/sessions` |
| `clear`, `exit`/`quit` | Session control |

The two informational commands are deliberate. The Node process cannot read the browser's IndexedDB, so rather than pretending otherwise it says what to use instead.

Filesystem access is opt-in and narrow:

| Variable | Effect |
|----------|--------|
| `OC_GALLERY_DIR` | Directory the CLI may read. Default `./gallery`. |
| `OC_OUTPUT_DIR` | The only default clone destination. |
| `OC_ALLOWED_CLONE_DIRS` | Extra permitted clone destinations, comma separated. |
| `OC_ALLOW_LOCAL_WRITES` | Must be `true` before anything is written. |
| `OC_ALLOW_OVERWRITE` | Must be `true` before an existing destination file is replaced. |

With `OC_ALLOW_LOCAL_WRITES` unset the CLI runs read-only and reports a refusal instead of writing. Cloning never moves or deletes the source asset.

## Notes

- The browser CLI and the standalone CLI are separate implementations. A feature added to one is not automatically in the other.
- `cli/artifacts.js` and `mcp/artifacts.js` expose the artifact engine to Node. Neither can read the browser's IndexedDB; they operate on their own artifact files.