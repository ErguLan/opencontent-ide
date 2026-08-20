import { describe, it, expect } from 'vitest';
import { PluginManager, HOOKS } from './PluginManager.js';

describe('PluginManager', () => {
    it('registers a plugin', () => {
        const manager = new PluginManager();
        manager.register({ name: 'test', register: () => {} });
        expect(manager.getPlugins()).toHaveLength(1);
    });

    it('runs a synchronous hook', () => {
        const manager = new PluginManager();
        manager.addHook(HOOKS.CLI_COMMAND, (list) => [...list, 'a']);
        manager.addHook(HOOKS.CLI_COMMAND, (list) => [...list, 'b']);
        const result = manager.runHookSync(HOOKS.CLI_COMMAND, []);
        expect(result).toEqual(['a', 'b']);
    });

    it('runs an async hook', async () => {
        const manager = new PluginManager();
        manager.addHook(HOOKS.GENERATION_BEFORE, async (ctx) => ({ ...ctx, modified: true }));
        const result = await manager.runHook(HOOKS.GENERATION_BEFORE, {});
        expect(result.modified).toBe(true);
    });

    it('does not duplicate plugins', () => {
        const manager = new PluginManager();
        manager.register({ name: 'dup' });
        manager.register({ name: 'dup' });
        expect(manager.getPlugins()).toHaveLength(1);
    });
});
