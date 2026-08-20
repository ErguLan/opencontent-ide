import { HOOKS } from '../PluginManager.js';

/**
 * HelloPlugin — Example plugin that adds a CLI command.
 */
export default {
    name: 'hello',
    version: '1.0.0',
    register(manager) {
        manager.addHook(HOOKS.CLI_COMMAND, (registry) => {
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
