import { getDefaultPluginManager } from './PluginManager.js';
import helloPlugin from './builtIn/hello.js';
import artifactPlugin from './builtIn/artifacts.js';

const manager = getDefaultPluginManager();
manager.register(helloPlugin);
manager.register(artifactPlugin);

export { manager, getDefaultPluginManager };
export * from './PluginManager.js';
