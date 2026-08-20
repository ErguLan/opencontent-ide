import { describe, it, expect } from 'vitest';
import { CliEngine } from './CliEngine';

describe('CliEngine', () => {
    it('registers and executes a simple command', async () => {
        const engine = new CliEngine();
        engine.register({
            name: 'hello',
            run: ({ args }) => ({ type: 'success', message: `Hello ${args[0] || 'world'}` })
        });

        const result = await engine.execute('hello Alice');
        expect(result.message).toBe('Hello Alice');
    });

    it('parses quoted arguments', async () => {
        const engine = new CliEngine();
        engine.register({
            name: 'echo',
            run: ({ args }) => ({ type: 'info', message: args.join('|') })
        });

        const result = await engine.execute('echo "hello world" foo');
        expect(result.message).toBe('hello world|foo');
    });

    it('parses flags', async () => {
        const engine = new CliEngine();
        engine.register({
            name: 'run',
            run: ({ args, flags }) => ({ type: 'info', message: `${args[0]} ${flags.verbose ? 'verbose' : 'quiet'}` })
        });

        const result = await engine.execute('run deploy --verbose');
        expect(result.message).toBe('deploy verbose');
    });

    it('returns error for unknown commands', async () => {
        const engine = new CliEngine();
        const result = await engine.execute('unknown');
        expect(result.type).toBe('error');
    });

    it('autocompletes command names', () => {
        const engine = new CliEngine();
        engine.register({ name: 'help', run: () => ({}) });
        engine.register({ name: 'hello', run: () => ({}) });

        expect(engine.autocomplete('he')).toEqual(['help', 'hello']);
    });

    it('tracks history', async () => {
        const engine = new CliEngine();
        engine.register({ name: 'noop', run: () => ({}) });
        await engine.execute('noop');
        expect(engine.getHistory()).toHaveLength(1);
    });
});
