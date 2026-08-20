#!/usr/bin/env node
/**
 * OpenContent IDE — MCP Tool Provider
 * 
 * Exposes OpenContent IDE capabilities as MCP tools so that
 * AI agents (Claude, Gemini, etc.) can use it as a content generation tool.
 * 
 * Protocol: Model Context Protocol (MCP) over stdio
 * 
 * Tools provided:
 *   - generate_content: Generate text content using AI
 *   - generate_image: Generate an image using AI
 *   - list_skills: List available AI personas/skills
 *   - list_models: List available AI models
 * 
 * Usage:
 *   OPENROUTER_API_KEY=sk-... node mcp/index.js
 */

import { createInterface } from 'readline';
import { mkdir, readdir, stat, writeFile, copyFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { sendToProvider, generateImageProvider } from '../server/lib/providers.js';
import { runAgenticCycle } from '../server/lib/agentic.js';
import { EDITOR_CONTEXT } from '../server/lib/editorContext.js';

// Config from env
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OUTPUT_DIR = path.resolve(process.env.OC_OUTPUT_DIR || path.join(process.cwd(), 'opencontent-artifacts'));
const GALLERY_DIR = path.resolve(process.env.OC_GALLERY_DIR || path.join(process.cwd(), 'gallery'));
const ALLOWED_CLONE_DIRS = [
    OUTPUT_DIR,
    ...(process.env.OC_ALLOWED_CLONE_DIRS || '')
        .split(path.delimiter)
        .map((directory) => directory.trim())
        .filter(Boolean)
        .map((directory) => path.resolve(directory))
];
const ARTIFACTS = new Map();
const API_BASE = process.env.OC_API_URL || 'http://localhost:4000';
const DEBUG_LOGS = process.env.OC_DEBUG_LOGS === 'true';

function log(message, details = {}) {
    if (DEBUG_LOGS) process.stderr.write(`[mcp] ${message} ${JSON.stringify(details)}\n`);
}

async function getClientConfig() {
    try {
        const response = await fetch(`${API_BASE}/api/client-config`);
        if (!response.ok) return {};
        return (await response.json()).config || {};
    } catch (error) {
        log('client-config-unavailable', { message: error.message });
        return {};
    }
}

async function resolveModelArgs(args, kind = 'text') {
    if (args.model && args.provider) return args;
    const config = await getClientConfig();
    const activeId = kind === 'image' ? config.activeImageModel : config.activeTextModel;
    const model = config.models?.find((item) => item.id === activeId);
    return {
        ...args,
        model: args.model || activeId,
        provider: args.provider || model?.provider,
        baseUrl: args.baseUrl || model?.baseUrl
    };
}

const IMAGE_EXTENSIONS = new Set(['.avif', '.gif', '.jpeg', '.jpg', '.png', '.svg', '.webp']);

function isWithinDirectory(candidate, directory) {
    const relative = path.relative(directory, candidate);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function sanitizeFilename(value, fallback) {
    const sanitized = String(value || fallback)
        .replace(/[<>:"/\\|?*]/g, '-')
        .replace(/[. ]+$/g, '')
        .trim();
    return path.basename(sanitized || fallback);
}

async function listGalleryFiles(directory = GALLERY_DIR, prefix = '') {
    let entries;
    try {
        entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
        if (error?.code === 'ENOENT') return [];
        throw error;
    }

    const files = [];
    for (const entry of entries) {
        const absolutePath = path.join(directory, entry.name);
        const relativePath = path.join(prefix, entry.name);
        if (entry.isDirectory()) {
            files.push(...await listGalleryFiles(absolutePath, relativePath));
        } else if (IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
            const info = await stat(absolutePath);
            files.push({
                assetId: relativePath.replaceAll(path.sep, '/'),
                name: entry.name,
                relativePath: relativePath.replaceAll(path.sep, '/'),
                size: info.size,
                modifiedAt: info.mtime.toISOString()
            });
        }
    }
    return files;
}

function resolveGalleryFile(assetId) {
    const normalized = String(assetId || '').replaceAll('/', path.sep);
    const candidate = path.resolve(GALLERY_DIR, normalized);
    if (!isWithinDirectory(candidate, GALLERY_DIR)) throw new Error('INVALID_GALLERY_ASSET');
    return candidate;
}

function resolveCloneDirectory(requestedDirectory) {
    const directory = path.resolve(requestedDirectory || OUTPUT_DIR);
    if (!ALLOWED_CLONE_DIRS.some((root) => isWithinDirectory(directory, root))) {
        throw new Error('CLONE_DESTINATION_NOT_ALLOWED');
    }
    return directory;
}

function getImageMimeType(filename) {
    const extension = path.extname(filename).toLowerCase();
    return {
        '.avif': 'image/avif',
        '.gif': 'image/gif',
        '.jpeg': 'image/jpeg',
        '.jpg': 'image/jpeg',
        '.png': 'image/png',
        '.svg': 'image/svg+xml',
        '.webp': 'image/webp'
    }[extension] || 'application/octet-stream';
}

async function publishSession(session) {
    try {
        await fetch(`${API_BASE}/api/sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(session)
        });
    } catch {
        // MCP remains usable when the optional graphical session bridge is offline.
    }
}

const SKILLS = [
    { id: 'content-creator', name: 'Content Creator', systemPrompt: 'You are a creative content assistant. Help the user create professional content for social media. Be direct and creative.' },
    { id: 'seo-writer', name: 'SEO Writer', systemPrompt: 'You are an SEO-optimized content writer. Create search-engine friendly content with relevant keywords.' },
    { id: 'brand-designer', name: 'Brand Designer', systemPrompt: 'You are a brand identity designer. Help create visual concepts, color palettes, and brand-consistent content.' },
    { id: 'social-strategist', name: 'Social Strategist', systemPrompt: 'You are a social media strategist. Analyze trends, suggest posting schedules, and create platform-specific content.' },
    { id: 'copywriter', name: 'Copywriter', systemPrompt: 'You are a professional copywriter. Write persuasive, concise copy for ads, landing pages, and email campaigns.' },
    { id: 'meme-creator', name: 'Meme Creator', systemPrompt: 'You create viral meme concepts and humorous social media content. Be funny and culturally aware.' }
];

// Tool definitions
const TOOLS = [
    {
        name: 'generate_content',
        description: 'Generate text content using AI. Supports multiple skills/personas like Content Creator, SEO Writer, Copywriter, etc.',
        inputSchema: {
            type: 'object',
            properties: {
                prompt: { type: 'string', description: 'The content generation prompt' },
                skill: { type: 'string', description: 'Skill/persona ID (content-creator, seo-writer, brand-designer, social-strategist, copywriter, meme-creator)', default: 'content-creator' },
                model: { type: 'string', description: 'Model ID selected by the user' },
                provider: { type: 'string', description: 'Provider adapter: openrouter, openai, google, anthropic, ollama or custom' },
                temperature: { type: 'number', description: 'Temperature (0.0-1.0)', default: 0.7 },
                max_tokens: { type: 'number', description: 'Max tokens', default: 1024 },
                systemPrompt: { type: 'string', description: 'Optional system context for a specialized question.' }
            },
            required: ['prompt', 'model', 'provider']
        }
    },
    {
        name: 'generate_image',
        description: 'Generate an image using the user-selected provider and model.',
        inputSchema: {
            type: 'object',
            properties: {
                prompt: { type: 'string', description: 'Image generation prompt' },
                model: { type: 'string', description: 'Image model ID selected by the user' },
                provider: { type: 'string', description: 'Provider adapter' },
                quality: { type: 'string' },
                size: { type: 'string' }
            },
            required: ['prompt', 'model', 'provider']
        }
    },
    {
        name: 'ask_editor',
        description: 'Ask about the verified OpenContent IDE editor implementation without inventing unsupported features.',
        inputSchema: {
            type: 'object',
            properties: {
                prompt: { type: 'string', description: 'Question about the actual editor.' },
                model: { type: 'string' },
                provider: { type: 'string' },
                max_tokens: { type: 'number' }
            },
            required: ['prompt']
        }
    },
    {
        name: 'save_image',
        description: 'Save a generated image to the explicitly configured MCP output directory.',
        inputSchema: {
            type: 'object',
            properties: {
                artifactId: { type: 'string' },
                filename: { type: 'string' }
            },
            required: ['artifactId']
        }
    },
    {
        name: 'list_gallery_assets',
        description: 'List image files in the explicitly configured gallery directory. The source files are never changed.',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string' },
                limit: { type: 'number', minimum: 1, maximum: 500 }
            }
        }
    },
    {
        name: 'get_gallery_asset',
        description: 'Inspect one image file in the configured gallery directory by its relative asset ID.',
        inputSchema: {
            type: 'object',
            properties: { assetId: { type: 'string' } },
            required: ['assetId']
        }
    },
    {
        name: 'clone_gallery_asset',
        description: 'Copy a gallery image to an approved local destination without removing or modifying the gallery source.',
        inputSchema: {
            type: 'object',
            properties: {
                assetId: { type: 'string' },
                destinationDirectory: { type: 'string', description: 'Must be OC_OUTPUT_DIR or inside OC_ALLOWED_CLONE_DIRS.' },
                filename: { type: 'string' },
                overwrite: { type: 'boolean' }
            },
            required: ['assetId']
        }
    },
    {
        name: 'agentic_generate',
        description: 'Run a coordinated content and image generation task. The image operation is handled separately from the text model.',
        inputSchema: {
            type: 'object',
            properties: {
                prompt: { type: 'string' },
                textModel: { type: 'string' },
                textProvider: { type: 'string' },
                imageModel: { type: 'string' },
                imageProvider: { type: 'string' },
                textBaseUrl: { type: 'string' },
                imageBaseUrl: { type: 'string' },
                temperature: { type: 'number' },
                max_tokens: { type: 'number' },
                imageOptions: {
                    type: 'object',
                    properties: {
                        size: { type: 'string' },
                        quality: { type: 'string' },
                        style: { type: 'string' },
                        negativePrompt: { type: 'string' }
                    },
                    additionalProperties: false
                }
            },
            required: ['prompt', 'textModel', 'textProvider']
        }
    },
    {
        name: 'list_skills',
        description: 'List available AI personas/skills for content generation.',
        inputSchema: { type: 'object', properties: {} }
    },
    {
        name: 'list_models',
        description: 'List available AI models including local Ollama models.',
        inputSchema: { type: 'object', properties: {} }
    }
];

async function getOllamaModels() {
    try {
        const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
        if (!res.ok) return [];
        const data = await res.json();
        return (data.models || []).map(m => ({ id: m.name || m.model, name: m.name || m.model, provider: 'ollama' }));
    } catch { return []; }
}

// Tool handlers
async function handleToolCall(name, args) {
    switch (name) {
        case 'generate_content': {
            const skill = SKILLS.find(s => s.id === (args.skill || 'content-creator')) || SKILLS[0];
            const resolved = await resolveModelArgs(args);
            if (!resolved.model || !resolved.provider) return [{ type: 'text', text: 'A user-selected model and provider are required.' }];
            log('generate_content', { model: resolved.model, provider: resolved.provider, hasPrompt: Boolean(resolved.prompt) });
            const result = await sendToProvider({
                prompt: resolved.prompt,
                model: resolved.model,
                provider: resolved.provider,
                baseUrl: resolved.baseUrl,
                skill: skill.id,
                systemPrompt: resolved.systemPrompt,
                temperature: args.temperature,
                max_tokens: args.max_tokens
            });
            if (result.success) {
                await publishSession({
                    prompt: resolved.prompt,
                    result: result.content || '',
                    model: result.model || args.model,
                    provider: result.provider || args.provider,
                    source: 'mcp',
                    externalSource: 'mcp'
                });
            }
            return [{ type: 'text', text: result.content || '' }];
        }
        case 'ask_editor': {
            const resolved = await resolveModelArgs(args);
            if (!resolved.model || !resolved.provider) return [{ type: 'text', text: 'A user-selected text model and provider are required.' }];
            log('ask_editor', { model: resolved.model, provider: resolved.provider, hasPrompt: Boolean(resolved.prompt) });
            const result = await sendToProvider({
                prompt: resolved.prompt,
                model: resolved.model,
                provider: resolved.provider,
                baseUrl: resolved.baseUrl,
                systemPrompt: EDITOR_CONTEXT,
                max_tokens: resolved.max_tokens
            });
            if (result.success) {
                await publishSession({
                    prompt: resolved.prompt,
                    result: result.content || '',
                    model: result.model || resolved.model,
                    provider: result.provider || resolved.provider,
                    source: 'mcp',
                    externalSource: 'mcp'
                });
            }
            return [{ type: 'text', text: result.content || result.error || '' }];
        }
        case 'generate_image': {
            if (!args.model || !args.provider) return [{ type: 'text', text: 'A user-selected image model and provider are required.' }];
            const generated = await generateImageProvider({
                prompt: args.prompt,
                model: args.model,
                provider: args.provider,
                options: {
                    ...(args.quality ? { quality: args.quality } : {}),
                    ...(args.size ? { size: args.size } : {})
                }
            });
            const artifactId = `mcp_artifact_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
            ARTIFACTS.set(artifactId, { imageUrl: generated.imageUrl, model: generated.model, prompt: args.prompt, mediaType: 'image/png' });
            const generatedWithId = { ...generated, artifactId };
            const content = [{ type: 'text', text: `Image generated. Artifact ID: ${generatedWithId.artifactId}` }];
            if (generatedWithId.imageUrl.startsWith('data:')) {
                content.push({ type: 'image', data: generatedWithId.imageUrl.split(',')[1], mimeType: generatedWithId.mediaType || 'image/png' });
            } else {
                content.push({ type: 'text', text: generatedWithId.imageUrl });
            }
            return content;
        }
        case 'save_image': {
            if (process.env.OC_ALLOW_LOCAL_WRITES !== 'true') {
                return [{ type: 'text', text: 'Local saving is blocked. Set OC_ALLOW_LOCAL_WRITES=true and configure OC_OUTPUT_DIR.' }];
            }
            const artifact = ARTIFACTS.get(args.artifactId);
            if (!artifact) return [{ type: 'text', text: 'Artifact not found.' }];
            const requestedFilename = String(args.filename || `${args.artifactId}.png`).replace(/[<>:"/\\|?*]/g, '-').trim();
            const filename = requestedFilename && requestedFilename !== '.' && requestedFilename !== '..'
                ? path.basename(requestedFilename)
                : `${args.artifactId}.png`;
            await mkdir(OUTPUT_DIR, { recursive: true });
            const data = artifact.imageUrl.startsWith('data:')
                ? Buffer.from(artifact.imageUrl.split(',')[1], 'base64')
                : Buffer.from(await (await fetch(artifact.imageUrl)).arrayBuffer());
            const destination = path.resolve(OUTPUT_DIR, filename);
            if (destination !== OUTPUT_DIR && !destination.startsWith(`${OUTPUT_DIR}${path.sep}`)) {
                return [{ type: 'text', text: 'Invalid image filename.' }];
            }
            await writeFile(destination, data);
            return [{ type: 'text', text: `Saved image to ${destination}` }];
        }
        case 'list_gallery_assets': {
            const query = String(args.query || '').trim().toLowerCase();
            const limit = Math.min(Math.max(Number(args.limit) || 100, 1), 500);
            const assets = (await listGalleryFiles())
                .filter((asset) => !query || `${asset.name} ${asset.relativePath}`.toLowerCase().includes(query))
                .sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt))
                .slice(0, limit);
            return [{ type: 'text', text: JSON.stringify({ galleryDirectory: GALLERY_DIR, total: assets.length, assets }, null, 2) }];
        }
        case 'get_gallery_asset': {
            const absolutePath = resolveGalleryFile(args.assetId);
            const info = await stat(absolutePath);
            if (!info.isFile() || !IMAGE_EXTENSIONS.has(path.extname(absolutePath).toLowerCase())) {
                return [{ type: 'text', text: 'Gallery asset is not an image file.' }];
            }
            const imageData = await readFile(absolutePath);
            const metadata = {
                galleryDirectory: GALLERY_DIR,
                assetId: String(args.assetId),
                name: path.basename(absolutePath),
                size: info.size,
                modifiedAt: info.mtime.toISOString(),
                sourceRetained: true
            };
            return [
                { type: 'text', text: JSON.stringify(metadata, null, 2) },
                { type: 'image', data: imageData.toString('base64'), mimeType: getImageMimeType(absolutePath) }
            ];
        }
        case 'clone_gallery_asset': {
            if (process.env.OC_ALLOW_LOCAL_WRITES !== 'true') {
                return [{ type: 'text', text: 'Local cloning is blocked. Set OC_ALLOW_LOCAL_WRITES=true and configure an allowed destination.' }];
            }
            const source = resolveGalleryFile(args.assetId);
            const sourceInfo = await stat(source);
            if (!sourceInfo.isFile() || !IMAGE_EXTENSIONS.has(path.extname(source).toLowerCase())) {
                return [{ type: 'text', text: 'Gallery asset is not an image file.' }];
            }
            const destinationDirectory = resolveCloneDirectory(args.destinationDirectory);
            const filename = sanitizeFilename(args.filename || path.basename(source), `${path.basename(source)}.png`);
            const destination = path.resolve(destinationDirectory, filename);
            if (!isWithinDirectory(destination, destinationDirectory)) throw new Error('INVALID_CLONE_FILENAME');
            await mkdir(destinationDirectory, { recursive: true });
            if (args.overwrite !== true || process.env.OC_ALLOW_OVERWRITE !== 'true') {
                await copyFile(source, destination, 1);
            } else {
                await copyFile(source, destination);
            }
            return [{ type: 'text', text: JSON.stringify({
                sourceAssetId: args.assetId,
                sourcePath: source,
                destinationPath: destination,
                sourceRetainedInGallery: true
            }, null, 2) }];
        }
        case 'agentic_generate': {
            if (!args.textModel || !args.textProvider) {
                return [{ type: 'text', text: 'A user-selected text model and provider are required.' }];
            }
            const result = await runAgenticCycle({
                prompt: args.prompt,
                textModel: args.textModel,
                textProvider: args.textProvider,
                textBaseUrl: args.textBaseUrl,
                imageModel: args.imageModel,
                imageProvider: args.imageProvider,
                imageBaseUrl: args.imageBaseUrl,
                imageOptions: args.imageOptions,
                temperature: args.temperature,
                max_tokens: args.max_tokens
            });
            let artifactId = null;
            if (result.imageUrl) {
                artifactId = `mcp_artifact_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
                const mediaType = result.imageUrl.startsWith('data:')
                    ? result.imageUrl.slice(5).split(';')[0] || 'image/png'
                    : 'image/png';
                ARTIFACTS.set(artifactId, { imageUrl: result.imageUrl, model: result.imageModel, prompt: args.prompt, mediaType });
            }
            const exposedResult = { ...result, imageArtifactId: artifactId };
            if (result.success) {
                await publishSession({
                    prompt: args.prompt,
                    result: result.content || 'Agent completed.',
                    model: result.model || args.textModel,
                    provider: result.provider || args.textProvider,
                    imageUrl: result.imageUrl || null,
                    imageModel: result.imageModel || null,
                    source: 'mcp',
                    externalSource: 'mcp',
                    type: result.imageUrl ? 'agentic' : 'text',
                    steps: result.steps
                });
            }
            const content = [{ type: 'text', text: JSON.stringify(exposedResult, null, 2) }];
            if (result.imageUrl?.startsWith('data:')) {
                content.push({ type: 'image', data: result.imageUrl.split(',')[1], mimeType: result.operation?.mediaType || 'image/png' });
            }
            return content;
        }
        case 'list_skills':
            return [{ type: 'text', text: JSON.stringify(SKILLS.map(s => ({ id: s.id, name: s.name })), null, 2) }];
        case 'list_models': {
            let cloud = [];
            try {
                const configured = JSON.parse(process.env.OC_MODELS || '[]');
                if (Array.isArray(configured)) cloud = configured;
            } catch { /* Ignore malformed optional model configuration. */ }
            const ollama = await getOllamaModels();
            return [{ type: 'text', text: JSON.stringify([...cloud, ...ollama], null, 2) }];
        }
        default:
            return [{ type: 'text', text: `Unknown tool: ${name}` }];
    }
}

// MCP stdio protocol
const rl = createInterface({ input: process.stdin });
function send(obj) {
    process.stdout.write(JSON.stringify(obj) + '\n');
}

rl.on('line', async (line) => {
    let msg;
    try { msg = JSON.parse(line); } catch { return; }

    const { id, method, params } = msg;

    switch (method) {
        case 'initialize':
            send({
                jsonrpc: '2.0', id,
                result: {
                    protocolVersion: '2024-11-05',
                    capabilities: { tools: {} },
                    serverInfo: { name: 'opencontent-ide', version: '0.1.0' }
                }
            });
            break;

        case 'tools/list':
            send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
            break;

        case 'tools/call':
            try {
                const content = await handleToolCall(params.name, params.arguments || {});
                send({ jsonrpc: '2.0', id, result: { content } });
            } catch (err) {
                send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true } });
            }
            break;

        case 'notifications/initialized':
            // Client acknowledged initialization
            break;

        default:
            send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
    }
});

process.stderr.write('OpenContent IDE MCP server running on stdio\n');
