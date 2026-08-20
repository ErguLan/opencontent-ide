/**
 * Built-in browser CLI commands.
 */
import { ROUTES, THEMES, LANGUAGES } from '../../config/constants';
import { getActiveTextModel, getActiveImageModel, getActiveVisionModel, setActiveModels, sendToAI, generateImage } from '../../services/ai';
import { executeAgenticPipeline } from '../../services/ai/agenticPipeline';
import { executeAgentTool } from '../../services/ai/toolRuntime';
import { addModel, getStoredModels, MODEL_TYPES, PROVIDERS } from '../../services/models';
import { getAllMedia, deleteMedia } from '../../services/mediaService';
import { saveImageArtifact } from '../../services/imageArtifacts';
import { getLocalProjects, saveLocalProject, deleteLocalProject } from '../../services/projectsLocal';

function requireForce(flags, description) {
    return flags.force ? null : { type: 'warning', message: `${description}\nRe-run with --force to confirm.` };
}

export function createBuiltinCommands({ navigate, toggleTheme, setTheme, language, changeLanguage, t }) {
    return [
        {
            name: 'help', category: 'general', description: t('cli.helpDescription'), usage: 'help [command]',
            run: ({ args, engine }) => {
                if (args[0]) {
                    const command = engine.commands.get(args[0]);
                    if (!command) return { type: 'error', message: `No help available for '${args[0]}'.` };
                    return { type: 'info', message: `${command.usage || command.name}\n${command.description || ''}` };
                }
                const groups = new Map();
                for (const command of engine.getHelp()) {
                    const category = command.category || 'general';
                    if (!groups.has(category)) groups.set(category, []);
                    groups.get(category).push(command);
                }
                const output = [...groups.entries()].map(([category, commands]) => `${category.toUpperCase()}\n${commands.map((command) => `  ${command.name.padEnd(14)} ${command.description}`).join('\n')}`).join('\n\n');
                return { type: 'info', message: output };
            }
        },
        { name: 'clear', category: 'general', description: t('cli.clearDescription'), usage: 'clear', run: () => ({ type: 'clear' }) },
        {
            name: 'theme', category: 'config', description: t('cli.themeDescription'), usage: `theme [${THEMES.DARK}|${THEMES.LIGHT}]`, argHints: [THEMES.DARK, THEMES.LIGHT],
            run: ({ args }) => {
                const next = args[0];
                if (next === THEMES.DARK || next === THEMES.LIGHT) { setTheme(next); return { type: 'success', message: t('cli.themeSet', { theme: next }) }; }
                toggleTheme();
                return { type: 'success', message: t('cli.themeToggled') };
            }
        },
        {
            name: 'lang', category: 'config', description: t('cli.langDescription'), usage: `lang [${LANGUAGES.EN}|${LANGUAGES.ES}]`, argHints: [LANGUAGES.EN, LANGUAGES.ES],
            run: ({ args }) => {
                const next = args[0];
                if (next === LANGUAGES.DARK || next === LANGUAGES.LIGHT) return { type: 'error', message: 'Invalid language.' };
                if (next === LANGUAGES.EN || next === LANGUAGES.ES) { changeLanguage(next); return { type: 'success', message: t('cli.langSet', { lang: next }) }; }
                return { type: 'info', message: `Current language: ${language}` };
            }
        },
        {
            name: 'goto', category: 'navigation', description: t('cli.gotoDescription'), usage: 'goto [landing|workspace|settings|cli|gallery|artifacts]', argHints: ['landing','workspace','settings','cli','gallery','artifacts'],
            run: ({ args }) => {
                const target = args[0] || 'landing';
                const map = { landing: ROUTES.LANDING, workspace: ROUTES.WORKSPACE, settings: ROUTES.SETTINGS, cli: ROUTES.CLI, gallery: ROUTES.GALLERY, artifacts: ROUTES.ARTIFACTS, login: ROUTES.LOGIN };
                const path = map[target] || `/${target}`;
                navigate(path);
                return { type: 'success', message: t('cli.gotoDone', { path }) };
            }
        },
        {
            name: 'model', category: 'config', description: t('cli.modelDescription'), usage: 'model [list|add|set|clear] ...', argHints: ['list','add','set','clear'],
            run: ({ args, flags }) => {
                const action = args[0] || 'list';
                if (action === 'add') {
                    const id = args[1];
                    const provider = args[2];
                    const type = args[3] || MODEL_TYPES.TEXT;
                    if (!id || !Object.values(PROVIDERS).includes(provider)) return { type: 'error', message: 'Usage: model add <id> <provider> [type] --text --vision --image --tools --editing [--url baseUrl]' };
                    const model = addModel({
                        id, provider, type, baseUrl: flags.url,
                        capabilities: {
                            text: Boolean(flags.text) || type === MODEL_TYPES.TEXT,
                            vision: Boolean(flags.vision),
                            imageGeneration: Boolean(flags.image) || type === MODEL_TYPES.IMAGE,
                            toolCalling: Boolean(flags.tools),
                            imageEditing: Boolean(flags.editing)
                        }
                    });
                    return { type: 'success', message: `Registered ${model.id} for ${model.provider}. No model was auto-selected.` };
                }
                if (action === 'clear') {
                    const type = args[1];
                    if (type === 'text') setActiveModels('', undefined, undefined);
                    else if (type === 'image') setActiveModels(undefined, '', undefined);
                    else if (type === 'vision') setActiveModels(undefined, undefined, '');
                    else return { type: 'error', message: 'Usage: model clear <text|image|vision>' };
                    return { type: 'success', message: `Cleared ${type} model selection.` };
                }
                if (action === 'set') {
                    const type = args[1];
                    const id = args[2];
                    if (!['text','image','vision'].includes(type) || !id) return { type: 'error', message: 'Usage: model set <text|image|vision> <id>' };
                    const selected = getStoredModels().find((model) => model.id === id);
                    const capability = type === 'text' ? 'text' : type === 'image' ? 'imageGeneration' : 'vision';
                    if (!selected?.capabilities?.[capability]) return { type: 'error', message: 'Model is not registered with the requested capability.' };
                    if (type === 'text') setActiveModels(id, undefined, undefined);
                    else if (type === 'image') setActiveModels(undefined, id, undefined);
                    else setActiveModels(undefined, undefined, id);
                    return { type: 'success', message: t('cli.modelSet', { type, id }) };
                }
                const models = getStoredModels();
                const lines = models.map((model) => `${model.id}  ${model.provider}  ${Object.entries(model.capabilities || {}).filter(([, enabled]) => enabled).map(([key]) => key).join(',')}`).join('\n');
                return { type: 'info', message: `selected text: ${getActiveTextModel() || 'none'}\nselected vision: ${getActiveVisionModel() || 'none'}\nselected image: ${getActiveImageModel() || 'none'}\n\nregistered:\n${lines || '  none'}` };
            }
        },
        {
            name: 'generate', category: 'content', description: t('cli.generateDescription'), usage: 'generate <prompt> [--image]',
            run: async ({ args, flags }) => {
                const prompt = args.join(' ');
                if (!prompt) return { type: 'error', message: t('cli.generateMissingPrompt') };
                const modelId = getActiveTextModel();
                if (!modelId) return { type: 'error', message: 'No text model selected. Use `model set text <id>`.' };
                const project = await saveLocalProject({ name: prompt.substring(0, 50), prompt, type: 'content', createdAt: new Date().toISOString() });
                const response = await sendToAI(prompt, modelId);
                if (!response.success) return { type: 'error', message: response.error || 'Generation failed' };
                let output = response.content?.trim() || '';
                if (flags.image) {
                    const imageModel = getActiveImageModel();
                    if (!imageModel) return { type: 'error', message: 'No image model selected.' };
                    const image = await generateImage(prompt, imageModel);
                    if (!image.success) return { type: 'error', message: image.error || 'Image generation failed' };
                    const artifact = await saveImageArtifact(image.imageUrl, { projectId: project.id, projectName: project.name, version: 1, prompt, model: image.model });
                    output += `\n\nImage artifact: ${artifact.asset.id}`;
                }
                await saveLocalProject({ id: project.id, result: output, updatedAt: new Date().toISOString() });
                return { type: 'success', message: output };
            }
        },
        {
            name: 'agent', category: 'content', description: 'Run the coordinated image/content agent harness', usage: 'agent <prompt>',
            run: async ({ args }) => {
                const prompt = args.join(' ');
                if (!prompt) return { type: 'error', message: 'Provide a prompt after "agent".' };
                const textModel = getActiveTextModel();
                if (!textModel) return { type: 'error', message: 'No text model selected.' };
                const result = await executeAgenticPipeline({ prompt, selectedTextModel: textModel, selectedImageModel: getActiveImageModel(), sourceImages: [], t, onSteps: () => {}, onChunk: () => {} });
                return { type: 'success', message: `${result.text || ''}${result.imageUrl ? `\nImage artifact: ${result.images?.at(-1)?.assetId || 'generated'}` : ''}` };
            }
        },
        {
            name: 'gallery', category: 'assets', description: 'Browse and manage generated image assets', usage: 'gallery [list|view|clone|delete] [id] [--force]', argHints: ['list','view','clone','delete'],
            run: async ({ args, flags }) => {
                const action = args[0] || 'list';
                const assets = await getAllMedia();
                if (action === 'list' || action === 'ls') return { type: 'info', message: assets.length ? assets.map((asset, index) => `${index + 1}. ${asset.name || 'unnamed'}  ${asset.id}`).join('\n') : 'Gallery is empty.' };
                const found = assets.find((asset) => asset.id?.includes(args[1] || ''));
                if (!found) return { type: 'error', message: 'Asset not found.' };
                if (action === 'view') return { type: 'info', message: JSON.stringify({ id: found.id, name: found.name, type: found.type, role: found.role, createdAt: found.createdAt }, null, 2) };
                if (action === 'clone') {
                    const result = await executeAgentTool('clone_gallery_asset', { assetId: found.id, destination: 'configured', approved: true }, { projectName: 'gallery-copy' });
                    return { type: result.status === 'configured-directory' ? 'success' : 'info', message: `Cloned ${found.name}: ${result.external?.mode || result.status}. Original retained.` };
                }
                if (action === 'delete') {
                    const warning = requireForce(flags, `Delete ${found.name}?`);
                    if (warning) return warning;
                    await deleteMedia(found.id);
                    return { type: 'success', message: `Deleted: ${found.name}` };
                }
                return { type: 'info', message: 'Usage: gallery [list|view <id>|clone <id>|delete <id> --force]' };
            }
        },
        {
            name: 'project', category: 'projects', description: 'Manage projects', usage: 'project [list|open|delete|new] [id|prompt] [--force]', argHints: ['list','open','delete','new'],
            run: async ({ args, flags }) => {
                const action = args[0] || 'list';
                const projects = await getLocalProjects();
                if (action === 'list' || action === 'ls') return { type: 'info', message: projects.length ? projects.map((project, index) => `${index + 1}. ${project.name || 'untitled'}  ${project.id}`).join('\n') : 'No projects yet.' };
                if (action === 'new') {
                    const prompt = args.slice(1).join(' ') || 'New project';
                    const project = await saveLocalProject({ name: prompt.substring(0, 50), prompt, type: 'content' });
                    navigate(ROUTES.PROJECT.replace(':id', project.id));
                    return { type: 'success', message: `Created project: ${project.id}` };
                }
                const found = projects.find((project) => project.id?.includes(args[1] || ''));
                if (!found) return { type: 'error', message: 'Project not found.' };
                if (action === 'open') { navigate(ROUTES.PROJECT.replace(':id', found.id)); return { type: 'success', message: `Opening: ${found.name}` }; }
                if (action === 'delete') {
                    const warning = requireForce(flags, `Delete ${found.name}?`);
                    if (warning) return warning;
                    await deleteLocalProject(found.id);
                    return { type: 'success', message: `Deleted: ${found.name}` };
                }
                return { type: 'info', message: 'Usage: project [list|open <id>|delete <id> --force|new <prompt>]' };
            }
        },
        {
            name: 'exit', category: 'navigation', description: t('cli.exitDescription'), usage: 'exit',
            run: () => { navigate(ROUTES.LANDING); return { type: 'success', message: t('cli.exitDone') }; }
        }
    ];
}
