/**
 * CliEngine — Extensible command engine for the OpenContent IDE CLI.
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
        command.aliases?.forEach((alias) => this.commands.set(alias, command));
        return this;
    }

    parse(input) {
        const trimmed = input.trim();
        if (!trimmed) return { command: '', args: [], flags: {} };
        const tokens = [];
        let current = '';
        let quote = null;
        for (let index = 0; index < trimmed.length; index += 1) {
            const char = trimmed[index];
            const prev = trimmed[index - 1];
            if (quote) {
                if (char === quote && prev !== '\\') { tokens.push(current); current = ''; quote = null; }
                else current += char;
            } else if (char === '"' || char === "'") quote = char;
            else if (char === ' ' || char === '\t') { if (current) { tokens.push(current); current = ''; } }
            else current += char;
        }
        if (current) tokens.push(current);

        const args = [];
        const flags = {};
        for (let index = 0; index < tokens.length; index += 1) {
            const token = tokens[index];
            if (token.startsWith('--')) {
                const key = token.slice(2);
                const next = tokens[index + 1];
                if (next && !next.startsWith('--')) { flags[key] = next; index += 1; }
                else flags[key] = true;
            } else if (index > 0) args.push(token);
        }
        return { command: tokens[0] || '', args, flags };
    }

    distance(left, right) {
        const a = String(left || '');
        const b = String(right || '');
        const rows = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
        for (let i = 0; i <= a.length; i += 1) rows[i][0] = i;
        for (let j = 0; j <= b.length; j += 1) rows[0][j] = j;
        for (let i = 1; i <= a.length; i += 1) {
            for (let j = 1; j <= b.length; j += 1) {
                rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
            }
        }
        return rows[a.length][b.length];
    }

    suggestCommand(input) {
        const names = this.getHelp().map((command) => command.name);
        const best = names.map((name) => ({ name, score: this.distance(input, name) })).sort((a, b) => a.score - b.score)[0];
        return best && best.score <= Math.max(2, Math.floor(input.length / 2)) ? best.name : null;
    }

    async execute(input) {
        const { command, args, flags } = this.parse(input);
        if (!command) return { type: 'info', message: '' };
        this.history.push({ input, timestamp: Date.now() });
        const cmd = this.commands.get(command);
        if (!cmd) {
            const suggestion = this.suggestCommand(command);
            return { type: 'error', message: `Unknown command: ${command}.${suggestion ? ` Did you mean '${suggestion}'?` : " Type 'help' for available commands."}` };
        }
        try {
            const result = await cmd.run({ args, flags, raw: input, engine: this, context: this.context });
            return result || { type: 'success', message: '' };
        } catch (error) {
            return { type: 'error', message: error?.message || String(error) };
        }
    }

    autocomplete(input) {
        const raw = String(input || '');
        const trimmed = raw.trim();
        if (!trimmed) return this.getHelp().map((command) => command.name);
        const { command, args } = this.parse(raw);
        const cmd = this.commands.get(command);
        if (cmd && raw.endsWith(' ')) return (cmd.argHints || []).filter((hint) => !args.includes(hint));
        return this.getHelp().map((item) => item.name).filter((name) => name.startsWith(command));
    }

    getHistory() { return this.history.slice(); }
    getHelp() {
        return Array.from(this.commands.values())
            .filter((command) => !command.hidden)
            .filter((value, index, array) => array.findIndex((command) => command.name === value.name) === index)
            .map((command) => ({ name: command.name, description: command.description || '', usage: command.usage || command.name, category: command.category || 'general' }));
    }
}
