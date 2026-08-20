/**
 * PluginManager — Extension system for OpenContent IDE.
 *
 * Plugins can register hooks to extend UI, commands, and generation behavior.
 * This is a skeleton; actual hook execution points are added gradually.
 */

export const HOOKS = {
    WORKSPACE_TOOLBAR: 'workspace.toolbar',
    WORKSPACE_CANVAS_AFTER: 'workspace.canvas.after',
    CLI_COMMAND: 'cli.command',
    SETTINGS_PANEL: 'settings.panel',
    GENERATION_BEFORE: 'generation.before',
    GENERATION_AFTER: 'generation.after'
};

export class PluginManager {
    constructor() {
        this.plugins = [];
        this.hooks = new Map();
        Object.values(HOOKS).forEach((name) => this.hooks.set(name, []));
    }

    register(plugin) {
        if (!plugin?.name) throw new Error('Plugin must have a name');
        if (this.plugins.some((p) => p.name === plugin.name)) {
            console.warn(`Plugin '${plugin.name}' is already registered`);
            return this;
        }
        this.plugins.push(plugin);
        if (typeof plugin.register === 'function') {
            plugin.register(this);
        }
        return this;
    }

    addHook(hookName, handler) {
        if (!this.hooks.has(hookName)) {
            this.hooks.set(hookName, []);
        }
        this.hooks.get(hookName).push(handler);
        return this;
    }

    async runHook(hookName, context = {}) {
        const handlers = this.hooks.get(hookName) || [];
        let result = context;
        for (const handler of handlers) {
            try {
                const next = await handler(result);
                if (next !== undefined) result = next;
            } catch (err) {
                console.error(`Plugin hook '${hookName}' failed:`, err);
            }
        }
        return result;
    }

    runHookSync(hookName, context = {}) {
        const handlers = this.hooks.get(hookName) || [];
        let result = context;
        for (const handler of handlers) {
            try {
                const next = handler(result);
                if (next !== undefined) result = next;
            } catch (err) {
                console.error(`Plugin hook '${hookName}' failed:`, err);
            }
        }
        return result;
    }

    getPlugins() {
        return this.plugins.slice();
    }

    getHookHandlers(hookName) {
        return (this.hooks.get(hookName) || []).slice();
    }
}

let defaultManager = null;

export function getDefaultPluginManager() {
    if (!defaultManager) {
        defaultManager = new PluginManager();
    }
    return defaultManager;
}
