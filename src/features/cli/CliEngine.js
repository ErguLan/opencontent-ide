/**
 * CliEngine — Extensible command engine for the OpenContent IDE CLI.
 *
 * Supports:
 *   - Named command registration with description, usage, and argument hints.
 *   - Tokenization with single/double quote support.
 *   - Flag parsing: --key value and --boolean.
 *   - Contextual autocomplete (command names + per-command argument hints).
 *   - History of executed commands.
 */

export class CliEngine {
    constructor(context = {}) {
        this.commands = new Map();
        this.history = [];
        this.context = context;
    }

    register(command) {
        if (!command?.name) throw new Error('Command must have a name');
        this.commands.set(command.name, command);
        if (command.aliases) {
            command.aliases.forEach((alias) => this.commands.set(alias, command));
        }
        return this;
    }

    parse(input) {
        const trimmed = input.trim();
        if (!trimmed) return { command: '', args: [], flags: {} };

        const tokens = [];
        let current = '';
        let quote = null;

        for (let i = 0; i < trimmed.length; i++) {
            const char = trimmed[i];
            const prev = trimmed[i - 1];

            if (quote) {
                if (char === quote && prev !== '\\') {
                    tokens.push(current);
                    current = '';
                    quote = null;
                } else {
                    current += char;
                }
            } else if (char === '"' || char === "'") {
                quote = char;
            } else if (char === ' ' || char === '\t') {
                if (current) {
                    tokens.push(current);
                    current = '';
                }
            } else {
                current += char;
            }
        }
        if (current) tokens.push(current);

        const args = [];
        const flags = {};
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            if (token.startsWith('--')) {
                const key = token.slice(2);
                const next = tokens[i + 1];
                if (next && !next.startsWith('--')) {
                    flags[key] = next;
                    i++;
                } else {
                    flags[key] = true;
                }
            } else if (i === 0) {
                // command name, skip in args
            } else {
                args.push(token);
            }
        }

        return { command: tokens[0] || '', args, flags };
    }

    async execute(input) {
        const { command, args, flags } = this.parse(input);
        if (!command) return { type: 'info', message: '' };

        this.history.push({ input, timestamp: Date.now() });

        const cmd = this.commands.get(command);
        if (!cmd) {
            return {
                type: 'error',
                message: `Unknown command: ${command}. Type 'help' for available commands.`
            };
        }

        try {
            const result = await cmd.run({ args, flags, raw: input, engine: this, context: this.context });
            return result || { type: 'success', message: '' };
        } catch (err) {
            return { type: 'error', message: err?.message || String(err) };
        }
    }

    autocomplete(input) {
        const trimmed = input.trim();
        if (!trimmed) {
            return Array.from(this.commands.values())
                .filter((cmd) => !cmd.hidden)
                .map((cmd) => cmd.name)
                .filter((v, i, a) => a.indexOf(v) === i);
        }

        const { command, args } = this.parse(input);
        const cmd = this.commands.get(command);

        // Suggest arguments for a matched command
        if (cmd && args.length > 0 && input.endsWith(' ')) {
            return (cmd.argHints || []).filter((hint) => !args.includes(hint));
        }

        // Suggest command names
        return Array.from(this.commands.values())
            .filter((c) => !c.hidden && c.name.startsWith(command))
            .map((c) => c.name)
            .filter((v, i, a) => a.indexOf(v) === i);
    }

    getHistory() {
        return this.history.slice();
    }

    getHelp() {
        const list = Array.from(this.commands.values())
            .filter((cmd) => !cmd.hidden)
            .filter((v, i, a) => a.findIndex((c) => c.name === v.name) === i)
            .map((cmd) => ({
                name: cmd.name,
                description: cmd.description || '',
                usage: cmd.usage || cmd.name
            }));
        return list;
    }
}
