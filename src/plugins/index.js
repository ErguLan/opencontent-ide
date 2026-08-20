import { getDefaultPluginManager } from './PluginManager.js';
import helloPlugin from './builtIn/hello.js';

const manager = getDefaultPluginManager();

// Register built-in plugins
manager.register(helloPlugin);

export { manager, getDefaultPluginManager };
export * from './PluginManager.js';
