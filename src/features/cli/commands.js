/**
 * Built-in CLI commands.
 */

import { ROUTES, THEMES, LANGUAGES } from '../../config/constants';
import { getActiveTextModel, getActiveImageModel, setActiveModels, sendToAI, generateImage } from '../../services/ai';
import { executeAgenticPipeline } from '../../services/ai/agenticPipeline';
import { executeAgentTool } from '../../services/ai/toolRuntime';
import { addModel, getStoredModels, MODEL_TYPES, PROVIDERS } from '../../services/models';
import { getAllMedia, deleteMedia } from '../../services/mediaService';
import { saveImageArtifact } from '../../services/imageArtifacts';
import { getLocalProjects, saveLocalProject, deleteLocalProject } from '../../services/projectsLocal';

export function createBuiltinCommands({ navigate, toggleTheme, setTheme, language, changeLanguage, t }) {
    return [
        {
            name: 'help',
            description: t('cli.helpDescription'),
            usage: 'help [command]',
            run: ({ args, engine }) => {
                if (args[0]) {
                    const cmd = engine.commands.get(args[0]);
                    if (!cmd) return { type: 'error', message: `No help available for '${args[0]}'.` };
                    return { type: 'info', message: `${cmd.usage || cmd.name}\n${cmd.description || ''}` };
                }
                const lines = engine.getHelp().map((cmd) => `  ${cmd.name.padEnd(14)} ${cmd.description}`);
                return { type: 'info', message: `Available commands:\n${lines.join('\n')}` };
            }
        },
        {
            name: 'clear',
            description: t('cli.clearDescription'),
            usage: 'clear',
            run: () => ({ type: 'clear' })
        },
        {
            name: 'theme',
            description: t('cli.themeDescription'),
            usage: `theme [${THEMES.DARK}|${THEMES.LIGHT}]`,
            argHints: [THEMES.DARK, THEMES.LIGHT],
            run: ({ args }) => {
                const next = args[0];
                if (next === THEMES.DARK || next === THEMES.LIGHT) {
                    setTheme(next);
                    return { type: 'success', message: t('cli.themeSet', { theme: next }) };
                }
                toggleTheme();
                return { type: 'success', message: t('cli.themeToggled') };
            }
        },
        {
            name: 'lang',
            description: t('cli.langDescription'),
            usage: `lang [${LANGUAGES.EN}|${LANGUAGES.ES}]`,
            argHints: [LANGUAGES.EN, LANGUAGES.ES],
            run: ({ args }) => {
                const next = args[0];
                if (next === LANGUAGES.EN || next === LANGUAGES.ES) {
                    changeLanguage(next);
                    return { type: 'success', message: t('cli.langSet', { lang: next }) };
                }
                return { type: 'info', message: `Current language: ${language}` };
            }
        },
        {
            name: 'goto',
            description: t('cli.gotoDescription'),
            usage: `goto [${Object.keys(ROUTES).join('|').toLowerCase()}]`,
            argHints: ['landing', 'workspace', 'settings', 'cli', 'gallery'],
            run: ({ args }) => {
                const target = args[0] || 'landing';
                const map = {
                    landing: ROUTES.LANDING,
                    workspace: ROUTES.WORKSPACE,
                    settings: ROUTES.SETTINGS,
                    cli: ROUTES.CLI,
                    gallery: ROUTES.GALLERY,
                    login: ROUTES.LOGIN
                };
                const path = map[target] || `/${target}`;
                navigate(path);
                return { type: 'success', message: t('cli.gotoDone', { path }) };
            }
        },
        {
            name: 'model',
            description: t('cli.modelDescription'),
            usage: 'model [list|add|set] ...',
            argHints: ['list', 'add', 'set'],
            run: ({ args, flags }) => {
                const action = args[0];
                if (action === 'add') {
                    const id = args[1];
                    const provider = args[2];
                    const type = args[3] || MODEL_TYPES.TEXT;
                    if (!id || !Object.values(PROVIDERS).includes(provider)) {
                        return { type: 'error', message: 'Usage: model add <id> <provider> [type] --text --vision --image --tools --editing' };
                    }
                    const model = addModel({
                        id,
                        provider,
                        type,
                        baseUrl: flags.url,
                        capabilities: {
                            text: Boolean(flags.text),
                            vision: Boolean(flags.vision),
                            imageGeneration: Boolean(flags.image),
                            toolCalling: Boolean(flags.tools),
                            imageEditing: Boolean(flags.editing)
                        }
                    });
                    return { type: 'success', message: `Registered ${model.id} for ${model.provider}.` };
                }
                const type = action === 'set' ? args[1] : null;
                const id = action === 'set' ? args[2] : null;
                if (!type) {
                    const text = getActiveTextModel();
                    const image = getActiveImageModel();
                    const models = getStoredModels().map((model) => `${model.id} (${model.provider})`).join('\n  ');
                    return { type: 'info', message: `text: ${text}\nimage: ${image}\nregistered:\n  ${models}` };
                }
                if (type !== 'text' && type !== 'image') {
                    return { type: 'error', message: t('cli.modelTypeError') };
                }
                if (!id) {
                    const models = getStoredModels()
                        .filter((m) => (type === 'text' ? m.capabilities?.text : m.capabilities?.imageGeneration))
                        .map((m) => m.id)
                        .join('\n  ');
                    return { type: 'info', message: `Available ${type} models:\n  ${models}` };
                }
                const selected = getStoredModels().find((model) => model.id === id);
                if (!selected || (type === 'text' ? !selected.capabilities?.text : !selected.capabilities?.imageGeneration)) {
                    return { type: 'error', message: 'Model is not registered with the requested capability.' };
                }
                setActiveModels(type === 'text' ? id : null, type === 'image' ? id : null);
                return { type: 'success', message: t('cli.modelSet', { type, id }) };
            }
        },
        {
            name: 'generate',
            description: t('cli.generateDescription'),
            usage: 'generate <prompt> [--image]',
            run: async ({ args, flags }) => {
                const prompt = args.join(' ');
                if (!prompt) return { type: 'error', message: t('cli.generateMissingPrompt') };

                const modelId = getActiveTextModel();
                if (!modelId) return { type: 'error', message: 'No text model configured. Use \'model\' to set one.' };

                // Create project automatically
                const proj = await saveLocalProject({
                    name: prompt.substring(0, 50),
                    prompt,
                    type: 'content',
                    createdAt: new Date().toISOString()
                });

                try {
                    const response = await sendToAI(prompt, modelId);
                    if (!response.success) return { type: 'error', message: response.error || 'Generation failed' };

                    let output = response.content?.trim() || '';
                    if (flags.image) {
                        const imageModel = getActiveImageModel();
                        if (!imageModel) return { type: 'error', message: 'No image model configured.' };
                        const image = await generateImage(prompt, imageModel);
                        if (!image.success) return { type: 'error', message: image.error || 'Image generation failed' };
                        const artifact = await saveImageArtifact(image.imageUrl, {
                            projectId: proj.id,
                            projectName: proj.name,
                            version: 1,
                            prompt,
                            model: image.model
                        });
                        output += `\n\nImage artifact: ${artifact.asset.id}`;
                    }

                    // Save result to project
                    await saveLocalProject({
                        id: proj.id,
                        result: output,
                        updatedAt: new Date().toISOString()
                    });

                    return { type: 'success', message: output };
                } catch (err) {
                    return { type: 'error', message: err?.message || String(err) };
                }
            }
        },
        {
            name: 'agent',
            description: 'Run the coordinated image/content agent harness',
            usage: 'agent <prompt>',
            run: async ({ args }) => {
                const prompt = args.join(' ');
                if (!prompt) return { type: 'error', message: 'Provide a prompt after "agent".' };
                const textModel = getActiveTextModel();
                const imageModel = getActiveImageModel();
                if (!textModel) return { type: 'error', message: 'No text model configured.' };
                const result = await executeAgenticPipeline({
                    prompt,
                    selectedTextModel: textModel,
                    selectedImageModel: imageModel,
                    sourceImages: [],
                    t,
                    onSteps: () => {},
                    onChunk: () => {}
                });
                return { type: 'success', message: `${result.text}${result.imageUrl ? `\nImage artifact: ${result.images?.at(-1)?.assetId || 'generated'}` : ''}` };
            }
        },
        {
            name: 'gallery',
            description: 'Browse and manage generated assets',
            usage: 'gallery [list|view|clone|delete] [id]',
            argHints: ['list', 'view', 'clone', 'delete'],
            run: async ({ args }) => {
                const sub = args[0] || 'list';
                if (sub === 'list' || sub === 'ls') {
                    const assets = await getAllMedia();
                    if (assets.length === 0) return { type: 'info', message: 'Gallery is empty.' };
                    const lines = assets.map((a, i) => `  ${i + 1}. ${a.name?.substring(0, 40) || 'unnamed'} (${a.id?.slice(-8)})`);
                    return { type: 'info', message: `Gallery (${assets.length}):\n${lines.join('\n')}` };
                }
                if (sub === 'view' && args[1]) {
                    const assets = await getAllMedia();
                    const found = assets.find((a) => a.id?.includes(args[1]));
                    if (!found) return { type: 'error', message: 'Asset not found.' };
                    const previewMsg = `ID: ${found.id}\nName: ${found.name}\nType: ${found.type}\nRole: ${found.role || 'reference'}\nCreated: ${new Date(found.createdAt).toLocaleString()}`;
                    return { type: 'info', message: previewMsg };
                }
                if (sub === 'clone' && args[1]) {
                    const assets = await getAllMedia();
                    const found = assets.find((a) => a.id?.includes(args[1]));
                    if (!found) return { type: 'error', message: 'Asset not found.' };
                    const result = await executeAgentTool('clone_gallery_asset', {
                        assetId: found.id,
                        destination: 'configured',
                        approved: true
                    }, { projectName: 'gallery-copy' });
                    return {
                        type: result.status === 'configured-directory' ? 'success' : 'info',
                        message: `Cloned ${found.name}: ${result.external?.mode || result.status}. Original retained in gallery.`
                    };
                }
                if (sub === 'delete' && args[1]) {
                    const assets = await getAllMedia();
                    const found = assets.find((a) => a.id?.includes(args[1]));
                    if (!found) return { type: 'error', message: 'Asset not found.' };
                    await deleteMedia(found.id);
                    return { type: 'success', message: `Deleted: ${found.name}` };
                }
                return { type: 'info', message: 'Usage: gallery [list|view <id>|clone <id>|delete <id>]' };
            }
        },
        {
            name: 'project',
            description: 'Manage projects',
            usage: 'project [list|open|delete|new] [id|prompt]',
            argHints: ['list', 'open', 'delete', 'new'],
            run: async ({ args }) => {
                const sub = args[0] || 'list';
                if (sub === 'list' || sub === 'ls') {
                    const projects = await getLocalProjects();
                    if (projects.length === 0) return { type: 'info', message: 'No projects yet.' };
                    const lines = projects.map((p, i) => `  ${i + 1}. ${p.name?.substring(0, 40) || 'untitled'} (${p.id?.slice(-8)})`);
                    return { type: 'info', message: `Projects (${projects.length}):\n${lines.join('\n')}` };
                }
                if (sub === 'open' && args[1]) {
                    const projects = await getLocalProjects();
                    const found = projects.find((p) => p.id?.includes(args[1]));
                    if (!found) return { type: 'error', message: 'Project not found.' };
                    navigate(`${ROUTES.PROJECT.replace(':id', found.id)}`);
                    return { type: 'success', message: `Opening: ${found.name}` };
                }
                if (sub === 'delete' && args[1]) {
                    const projects = await getLocalProjects();
                    const found = projects.find((p) => p.id?.includes(args[1]));
                    if (!found) return { type: 'error', message: 'Project not found.' };
                    await deleteLocalProject(found.id);
                    return { type: 'success', message: `Deleted: ${found.name}` };
                }
                if (sub === 'new') {
                    const prompt = args.slice(1).join(' ') || 'New project';
                    const proj = await saveLocalProject({ name: prompt.substring(0, 50), prompt, type: 'content' });
                    navigate(`${ROUTES.PROJECT.replace(':id', proj.id)}`);
                    return { type: 'success', message: `Created project: ${proj.id?.slice(-8)}` };
                }
                return { type: 'info', message: 'Usage: project [list|open <id>|delete <id>|new <prompt>]' };
            }
        },
        {
            name: 'exit',
            description: t('cli.exitDescription'),
            usage: 'exit',
            run: () => {
                navigate(ROUTES.LANDING);
                return { type: 'success', message: t('cli.exitDone') };
            }
        }
    ];
}
