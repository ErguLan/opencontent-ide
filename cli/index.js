#!/usr/bin/env node

/**
 * OpenContent IDE — Standalone CLI
 *
 * Runs independently from the React app. Uses the API server
 * for AI generation (start with: OPENROUTER_API_KEY=... npm run server:start).
 *
 * Usage:
 *   node cli/index.js
 *   opencontent-cli           (if linked globally)
 *
 * Commands: help, generate <prompt>, image <prompt>, agent <prompt>, model [list|set], project [list|new]
 */

import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync, mkdirSync, writeFileSync, readdirSync, statSync, copyFileSync, existsSync } from 'node:fs';
import http from 'node:http';
import { extname, relative, resolve, join as joinPath, basename } from 'node:path';
import { EDITOR_CONTEXT } from '../server/lib/editorContext.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));

const API_BASE = process.env.OC_API_URL || 'http://localhost:4000';
const GALLERY_DIR = resolve(process.env.OC_GALLERY_DIR || join(process.cwd(), 'gallery'));
const DEFAULT_OUTPUT_DIR = resolve(process.env.OC_OUTPUT_DIR || join(process.cwd(), 'opencontent-artifacts'));
const ALLOWED_CLONE_DIRS = [
    DEFAULT_OUTPUT_DIR,
    ...(process.env.OC_ALLOWED_CLONE_DIRS || '')
        .split(requirePathDelimiter())
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => resolve(value))
];
const HISTORY = [];
const MAX_HISTORY = 100;
const DEBUG_LOGS = process.env.OC_DEBUG_LOGS === 'true';
const API_TIMEOUT_MS = Number(process.env.OC_API_TIMEOUT_MS) || 60000;

function printBanner() {
    console.log(`\n  OpenContent IDE CLI  v${pkg.version}`);
    console.log(`  Type 'help' for commands. Press Ctrl+C to exit.\n`);
}

function print(msg) {
    console.log(`  ${msg}`);
}

function log(message, details = {}) {
    if (DEBUG_LOGS) console.error(`[cli] ${message}`, JSON.stringify(details));
}

function requirePathDelimiter() {
    return process.platform === 'win32' ? ';' : ':';
}

function isWithinDirectory(candidate, directory) {
    const value = relative(directory, candidate);
    return value === '' || (!value.startsWith('..') && !value.includes(':'));
}

function listGalleryFiles(directory = GALLERY_DIR, prefix = '') {
    if (!existsSync(directory)) return [];
    const imageExtensions = new Set(['.avif', '.gif', '.jpeg', '.jpg', '.png', '.svg', '.webp']);
    const assets = [];
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const absolutePath = joinPath(directory, entry.name);
        const relativePath = joinPath(prefix, entry.name);
        if (entry.isDirectory()) assets.push(...listGalleryFiles(absolutePath, relativePath));
        else if (imageExtensions.has(extname(entry.name).toLowerCase())) {
            const info = statSync(absolutePath);
            assets.push({
                assetId: relativePath.replaceAll('\\', '/'),
                name: entry.name,
                relativePath: relativePath.replaceAll('\\', '/'),
                size: info.size,
                modifiedAt: info.mtime.toISOString()
            });
        }
    }
    return assets;
}

function sanitizeFilename(value, fallback) {
    const safe = String(value || fallback).replace(/[<>:"/\\|?*]/g, '-').replace(/[. ]+$/g, '').trim();
    return basename(safe || fallback);
}

function resolveGalleryFile(assetId) {
    const source = resolve(GALLERY_DIR, String(assetId || '').replaceAll('/', '\\'));
    if (!isWithinDirectory(source, GALLERY_DIR)) throw new Error('Invalid gallery asset');
    return source;
}

function resolveCloneDirectory(directory) {
    const target = resolve(directory || DEFAULT_OUTPUT_DIR);
    if (!ALLOWED_CLONE_DIRS.some((root) => isWithinDirectory(target, root))) throw new Error('Clone destination is not allowed');
    return target;
}

async function apiPost(endpoint, body) {
    log('request', { endpoint, model: body?.model, provider: body?.provider, hasPrompt: Boolean(body?.prompt) });
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const url = new URL(endpoint, API_BASE);
        const req = http.request(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            }
        }, (res) => {
            let raw = '';
            res.on('data', (chunk) => raw += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(raw);
                    log('response', { endpoint, status: res.statusCode, success: parsed?.success, error: parsed?.error });
                    resolve(parsed);
                } catch {
                    log('invalid-json-response', { endpoint, status: res.statusCode });
                    resolve({ success: false, error: raw });
                }
            });
        });
        req.on('error', (err) => reject(err));
        req.setTimeout(API_TIMEOUT_MS, () => req.destroy(new Error(`API_TIMEOUT_${API_TIMEOUT_MS}MS`)));
        req.write(data);
        req.end();
    });
}

async function apiGet(endpoint) {
    log('get', { endpoint });
    const response = await fetch(new URL(endpoint, API_BASE));
    return response.json();
}

async function getClientConfig() {
    try {
        const result = await apiGet('/api/client-config');
        return result.config || {};
    } catch (error) {
        log('client-config-unavailable', { message: error.message });
        return {};
    }
}

async function resolveCliModel(kind = 'text') {
    const config = await getClientConfig();
    const activeId = kind === 'image' ? config.activeImageModel : config.activeTextModel;
    const model = config.models?.find((item) => item.id === activeId) || null;
    return { id: activeId || null, provider: model?.provider || null, baseUrl: model?.baseUrl || null };
}

async function publishSession(session) {
    try {
        const result = await apiPost('/api/sessions', session);
        log('session-published', { success: result?.success, id: result?.session?.id, source: session.source });
    } catch {
        log('session-publish-failed', { endpoint: '/api/sessions' });
        // External generation remains usable when the optional session bridge is offline.
    }
}

async function handleHelp(args) {
    const cmds = [
        ['help', 'Show this help'],
        ['model [list|set <id> [provider]]', 'List or set active model and provider'],
        ['generate <prompt>', 'Generate text content'],
        ['ask-editor <question>', 'Ask about the verified editor implementation'],
        ['image <prompt> [--out path] [--name file]', 'Generate and save an image'],
        ['gallery [list|view|clone] [asset-id]', 'Inspect the configured filesystem gallery and clone assets'],
        ['agent <prompt> [--model id] [--provider name] [--image-model id] [--image-provider name]', 'Run the agentic image/content harness'],
        ['project [list|new <name>]', 'Manage projects'],
        ['clear', 'Clear the screen'],
        ['exit', 'Exit the CLI']
    ];
    if (args[0]) {
        const found = cmds.find(([name]) => name.startsWith(args[0]));
        if (found) print(`${found[0]} — ${found[1]}`);
        else print(`Unknown command: ${args[0]}`);
        return;
    }
    print('Available commands:');
    cmds.forEach(([name, desc]) => print(`  ${name.padEnd(24)} ${desc}`));
}

async function handleModel(args) {
    if (args[0] === 'list') {
        const res = await apiGet('/api/models');
        if (res.models) {
            print('Available models:');
            res.models.forEach((m) => print(`  ${m.id}`));
        } else {
            print('Could not fetch models. Is the API server running?');
        }
    } else if (args[0] === 'set' && args[1]) {
        process.env.OC_ACTIVE_MODEL = args[1];
        if (args[2]) process.env.OC_PROVIDER = args[2];
        print(`Model set to ${args[1]}`);
    } else {
        print(`Active model: ${process.env.OC_ACTIVE_MODEL || 'Not set'}${process.env.OC_PROVIDER ? ` (${process.env.OC_PROVIDER})` : ''}`);
    }
}

async function handleGenerate(args, systemPrompt = null) {
    const prompt = args.join(' ');
    if (!prompt) {
        print('Provide a prompt after "generate".');
        return;
    }

    const configured = await resolveCliModel('text');
    const model = process.env.OC_ACTIVE_MODEL || configured.id;
    if (!model) {
        print('No model set. Use: model set <model-id>');
        return;
    }
    const provider = process.env.OC_PROVIDER || configured.provider;
    if (!provider) {
        print('No provider set. Use: model set <model-id> <provider>');
        return;
    }

    print('Generating...');
    try {
        const res = await apiPost('/api/generate', {
            prompt,
            model,
            provider,
            baseUrl: process.env.OC_CUSTOM_BASE_URL || configured.baseUrl,
            max_tokens: Number(process.env.OC_MAX_TOKENS) || 512,
            ...(systemPrompt ? { systemPrompt } : {})
        });
        if (res.success) {
            const content = res.content?.trim() || '(empty response)';
            await publishSession({
                prompt,
                result: content,
                model: res.model || model,
                provider: res.provider || provider,
                source: 'cli',
                externalSource: 'cli'
            });
            print(content);
        } else {
            print(`Error: ${res.error || 'Generation failed'}`);
        }
    } catch (err) {
        print(`Connection error: ${err.message}. Is the API server running on ${API_BASE}?`);
    }
}

function readFlag(args, flag) {
    const index = args.indexOf(flag);
    return index === -1 ? null : args[index + 1] || null;
}

function argsWithoutFlags(args) {
    return args.filter((arg, index) => !arg.startsWith('--') && !args[index - 1]?.startsWith('--'));
}

async function handleImage(args) {
    const prompt = argsWithoutFlags(args).join(' ');
    if (!prompt) {
        print('Provide a prompt after "image".');
        return;
    }
    const configured = await resolveCliModel('image');
    const model = process.env.OC_ACTIVE_IMAGE_MODEL || process.env.OC_ACTIVE_MODEL || configured.id;
    if (!model) {
        print('No image model set. Use OC_ACTIVE_IMAGE_MODEL or model set <model-id>.');
        return;
    }
    const outputDirectory = readFlag(args, '--out') || process.env.OC_OUTPUT_DIR || join(process.cwd(), 'opencontent-artifacts');
    const filename = readFlag(args, '--name') || `opencontent-${Date.now()}.png`;
    print('Generating image...');
    const provider = readFlag(args, '--provider') || process.env.OC_IMAGE_PROVIDER || process.env.OC_PROVIDER || configured.provider;
    if (!provider) {
        print('No image provider set. Use --provider or configure OC_IMAGE_PROVIDER.');
        return;
    }
    const result = await apiPost('/api/generate-image', {
        prompt,
        model,
        provider,
        baseUrl: process.env.OC_CUSTOM_BASE_URL
    });
    if (!result.success || !result.imageUrl) {
        print(`Error: ${result.error || 'Image generation failed'}`);
        return;
    }
    mkdirSync(outputDirectory, { recursive: true });
    const destination = join(outputDirectory, filename.replace(/[<>:"/\\|?*]/g, '-'));
    const buffer = result.imageUrl.startsWith('data:')
        ? Buffer.from(result.imageUrl.split(',')[1], 'base64')
        : Buffer.from(await (await fetch(result.imageUrl)).arrayBuffer());
    writeFileSync(destination, buffer);
    print(`Saved image: ${destination}`);
}

function handleGallery(args) {
    const subcommand = args[0] || 'list';
    const assets = listGalleryFiles().sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt));
    if (subcommand === 'list' || subcommand === 'ls') {
        if (assets.length === 0) {
            print(`Gallery is empty: ${GALLERY_DIR}`);
            return;
        }
        print(`Gallery (${assets.length}) ${GALLERY_DIR}:`);
        assets.forEach((asset) => print(`  ${asset.assetId} (${asset.size} bytes)`));
        return;
    }
    const assetId = args[1];
    if (!assetId) {
        print('Usage: gallery [list|view|clone] <asset-id> [--out path] [--name file]');
        return;
    }
    const asset = assets.find((item) => item.assetId === assetId || item.assetId.endsWith(assetId));
    if (!asset) {
        print(`Gallery asset not found: ${assetId}`);
        return;
    }
    if (subcommand === 'view') {
        print(JSON.stringify(asset, null, 2));
        return;
    }
    if (subcommand === 'clone') {
        if (process.env.OC_ALLOW_LOCAL_WRITES !== 'true') {
            print('Local cloning is blocked. Set OC_ALLOW_LOCAL_WRITES=true.');
            return;
        }
        const source = resolveGalleryFile(asset.assetId);
        const destinationDirectory = resolveCloneDirectory(readFlag(args, '--out'));
        const filename = sanitizeFilename(readFlag(args, '--name') || asset.name, asset.name);
        const destination = joinPath(destinationDirectory, filename);
        mkdirSync(destinationDirectory, { recursive: true });
        if (existsSync(destination) && process.env.OC_ALLOW_OVERWRITE !== 'true') {
            print(`Overwrite blocked: ${destination}`);
            return;
        }
        copyFileSync(source, destination);
        print(`Cloned image to ${destination}; original retained in ${GALLERY_DIR}`);
    }
}

async function handleAgent(args) {
    const prompt = argsWithoutFlags(args).join(' ');
    if (!prompt) {
        print('Provide a prompt after "agent".');
        return;
    }
    const configured = await resolveCliModel('text');
    const model = readFlag(args, '--model') || process.env.OC_ACTIVE_MODEL || configured.id;
    const imageModel = readFlag(args, '--image-model') || process.env.OC_ACTIVE_IMAGE_MODEL;
    const provider = readFlag(args, '--provider') || process.env.OC_PROVIDER || configured.provider;
    const imageProvider = readFlag(args, '--image-provider') || process.env.OC_IMAGE_PROVIDER;
    print('Running agentic harness...');
    if (!model || !provider) {
        print('Text model and provider are required. Use --model/--provider or configure OC_ACTIVE_MODEL/OC_PROVIDER.');
        return;
    }
    const result = await apiPost('/api/agentic', {
        prompt,
        textModel: model,
        textProvider: provider,
        textBaseUrl: provider === 'custom' ? process.env.OC_CUSTOM_BASE_URL : undefined,
        imageModel,
        imageProvider,
        imageBaseUrl: imageProvider === 'custom' ? process.env.OC_CUSTOM_BASE_URL : undefined
    });
    if (!result.success) {
        print(`Error: ${result.error || 'Agentic run failed'}`);
        return;
    }
    await publishSession({
        prompt,
        result: result.content || 'Agent completed.',
        model: result.model || model,
        provider: result.provider || provider,
        imageUrl: result.imageUrl || null,
        imageModel: result.imageModel || null,
        source: 'cli',
        externalSource: 'cli',
        type: result.imageUrl ? 'agentic' : 'text',
        steps: result.steps
    });
    if (result.operation) {
        print(`Image operation: ${result.operation.status} (${result.imageProvider}/${result.imageModel})`);
        if (result.imageUrl) print(`Image artifact: ${result.imageUrl}`);
    }
    print(result.content || 'Agent completed.');
}

async function handleProject(args) {
    if (args[0] === 'list') {
        print('Project listing requires the React app. Use the web UI.');
    } else if (args[0] === 'new') {
        print('Create projects from the web UI or use the "generate" command.');
    } else {
        print('Usage: project list');
    }
}

async function main() {
    printBanner();

    const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: 'oc> '
    });

    rl.prompt();

    for await (const line of rl) {
        const input = line.trim();
        if (!input) { rl.prompt(); continue; }

        HISTORY.push(input);
        if (HISTORY.length > MAX_HISTORY) HISTORY.shift();

        const parts = input.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
        const cmd = parts[0]?.toLowerCase();
        const args = parts.slice(1).map((a) => a.replace(/^["']|["']$/g, ''));

        try {
            if (cmd === 'exit' || cmd === 'quit') {
                print('Goodbye.');
                process.exit(0);
            } else if (cmd === 'clear' || cmd === 'cls') {
                console.clear();
                printBanner();
            } else if (cmd === 'help') {
                await handleHelp(args);
            } else if (cmd === 'model') {
                await handleModel(args);
            } else if (cmd === 'generate') {
                await handleGenerate(args);
            } else if (cmd === 'ask-editor') {
                await handleGenerate(args, EDITOR_CONTEXT);
            } else if (cmd === 'image') {
                await handleImage(args);
            } else if (cmd === 'gallery') {
                handleGallery(args);
            } else if (cmd === 'agent') {
                await handleAgent(args);
            } else if (cmd === 'project') {
                await handleProject(args);
            } else {
                print(`Unknown command: ${cmd}. Type 'help'.`);
            }
        } catch (err) {
            print(`Error: ${err.message}`);
        }

        rl.prompt();
    }
}

main().catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
});
