#!/usr/bin/env node
/**
 * OpenContent CLI
 * - `opencontent` opens the interactive shell.
 * - `opencontent <command>` runs once for scripts/CI.
 * - Remote HTTP and HTTPS both use the Node 20 fetch API.
 */
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, basename, extname, relative, delimiter } from 'node:path';
import { readFileSync, mkdirSync, writeFileSync, readdirSync, statSync, copyFileSync, existsSync } from 'node:fs';
import { EDITOR_CONTEXT } from '../server/lib/editorContext.js';
import { parseDiagramDsl, diagramToSvg } from '../src/services/artifacts/diagramEngine.js';
import { documentFromText, serializeDocumentToPdf } from '../src/services/artifacts/pdfEngine.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
const DEFAULT_API = process.env.OC_API_URL || 'http://localhost:4000';
const GALLERY_DIR = resolve(process.env.OC_GALLERY_DIR || join(process.cwd(), 'gallery'));
const DEFAULT_OUTPUT_DIR = resolve(process.env.OC_OUTPUT_DIR || join(process.cwd(), 'opencontent-artifacts'));
const API_TIMEOUT_MS = Number(process.env.OC_API_TIMEOUT_MS) || 60000;
const MAX_HISTORY = 100;
const HISTORY = [];
const COMMANDS = ['help','status','doctor','model','generate','ask-editor','image','gallery','agent','project','artifact','diagram','document','pdf','clear','exit'];

let apiBase = DEFAULT_API;
let outputMode = { json: false, quiet: false, verbose: process.env.OC_DEBUG_LOGS === 'true' };

class CliError extends Error {
    constructor(message, code = 'CLI_ERROR', exitCode = 1, details = null) {
        super(message);
        this.code = code;
        this.exitCode = exitCode;
        this.details = details;
    }
}

function out(value) {
    if (outputMode.json) {
        process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
        return;
    }
    if (typeof value === 'string') process.stdout.write(`${value}\n`);
    else process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}
function progress(message) { if (!outputMode.quiet && !outputMode.json) process.stderr.write(`${message}\n`); }
function debug(message, details = {}) { if (outputMode.verbose) process.stderr.write(`[debug] ${message} ${JSON.stringify(details)}\n`); }
function warn(message) { if (!outputMode.json) process.stderr.write(`WARN  ${message}\n`); }
function fail(error) {
    const err = error instanceof CliError ? error : new CliError(error?.message || String(error));
    if (outputMode.json) process.stderr.write(`${JSON.stringify({ success: false, error: err.code, message: err.message, details: err.details }, null, 2)}\n`);
    else process.stderr.write(`ERROR ${err.message}\n`);
    return err.exitCode || 1;
}

function sanitizeFilename(value, fallback) {
    const safe = String(value || fallback).replace(/[<>:"/\\|?*]/g, '-').replace(/[. ]+$/g, '').trim();
    return basename(safe || fallback);
}
function isWithinDirectory(candidate, directory) {
    const value = relative(directory, candidate);
    return value === '' || (!value.startsWith('..') && !value.includes(':'));
}
function allowedCloneDirectories() {
    return [DEFAULT_OUTPUT_DIR, ...(process.env.OC_ALLOWED_CLONE_DIRS || '').split(delimiter).map((v) => v.trim()).filter(Boolean).map(resolve)];
}
function resolveCloneDirectory(directory) {
    const target = resolve(directory || DEFAULT_OUTPUT_DIR);
    if (!allowedCloneDirectories().some((root) => isWithinDirectory(target, root))) throw new CliError('Clone destination is not allowed.', 'CLONE_DESTINATION_NOT_ALLOWED');
    return target;
}
function listGalleryFiles(directory = GALLERY_DIR, prefix = '') {
    if (!existsSync(directory)) return [];
    const extensions = new Set(['.avif','.gif','.jpeg','.jpg','.png','.svg','.webp']);
    const assets = [];
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const absolute = join(directory, entry.name);
        const relativePath = join(prefix, entry.name);
        if (entry.isDirectory()) assets.push(...listGalleryFiles(absolute, relativePath));
        else if (extensions.has(extname(entry.name).toLowerCase())) {
            const info = statSync(absolute);
            assets.push({ assetId: relativePath.replaceAll('\\','/'), name: entry.name, size: info.size, modifiedAt: info.mtime.toISOString() });
        }
    }
    return assets;
}

async function apiFetch(endpoint, { method = 'GET', body, timeoutMs = API_TIMEOUT_MS } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const url = new URL(endpoint, apiBase);
    debug('request', { method, url: String(url) });
    try {
        const response = await fetch(url, {
            method,
            headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: controller.signal
        });
        const text = await response.text();
        let data;
        try { data = text ? JSON.parse(text) : {}; } catch { data = { success: false, error: text || `HTTP_${response.status}` }; }
        if (!response.ok) throw new CliError(data?.error || `HTTP ${response.status}`, 'REMOTE_ERROR', 1, { status: response.status, endpoint });
        return data;
    } catch (error) {
        if (error?.name === 'AbortError') throw new CliError(`Request timed out after ${timeoutMs}ms.`, 'API_TIMEOUT');
        if (error instanceof CliError) throw error;
        throw new CliError(`Cannot reach ${apiBase}: ${error.message}`, 'API_UNREACHABLE');
    } finally {
        clearTimeout(timer);
    }
}

async function getClientConfig() {
    const result = await apiFetch('/api/client-config');
    return result.config || {};
}
async function resolveCliModel(kind = 'text') {
    const config = await getClientConfig();
    const activeId = kind === 'image' ? config.activeImageModel : kind === 'vision' ? config.activeVisionModel : config.activeTextModel;
    const model = config.models?.find((item) => item.id === activeId) || null;
    return { id: activeId || null, provider: model?.provider || null, baseUrl: model?.baseUrl || null };
}
async function publishSession(session) {
    try { await apiFetch('/api/sessions', { method: 'POST', body: session }); }
    catch (error) { debug('session publish skipped', { message: error.message }); }
}

function flagValue(args, name) {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] || null : null;
}
function hasFlag(args, name) { return args.includes(name); }
function stripFlags(args, flagsWithValues = []) {
    const valueFlags = new Set(flagsWithValues);
    const clean = [];
    for (let index = 0; index < args.length; index += 1) {
        const token = args[index];
        if (token.startsWith('--')) {
            if (valueFlags.has(token)) index += 1;
            continue;
        }
        clean.push(token);
    }
    return clean;
}
function tokenize(input) {
    return input.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)?.map((part) => part.replace(/^["']|["']$/g, '')) || [];
}
function distance(a, b) {
    const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
    for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
    for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;
    for (let i = 1; i <= a.length; i += 1) for (let j = 1; j <= b.length; j += 1) dp[i][j] = Math.min(dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
    return dp[a.length][b.length];
}
function suggestion(command) {
    return COMMANDS.map((name) => ({ name, score: distance(command, name) })).sort((a,b) => a.score-b.score)[0];
}

function helpText(command = null) {
    const sections = {
        content: [['generate <prompt>', 'Generate text content'], ['image <prompt> [--out dir] [--name file]', 'Generate an image'], ['agent <prompt>', 'Run the coordinated agent harness']],
        artifacts: [['diagram "A -> B; B -> C" [-o file.svg]', 'Create a structured SVG diagram'], ['document <text> [-o file.pdf]', 'Create a PDF document locally'], ['pdf create <text> [-o file.pdf]', 'Create a PDF document'], ['artifact', 'Explain browser/local artifact scope']],
        configuration: [['status', 'Show API and selected model context'], ['doctor', 'Check remote API and configuration'], ['model [list|set <id> [provider]]', 'Inspect/override models'], ['ask-editor <question>', 'Ask about the verified editor implementation']],
        local: [['gallery [list|view|clone] [id]', 'Inspect filesystem gallery'], ['project list', 'Explain project availability'], ['clear', 'Clear interactive shell'], ['exit', 'Exit interactive shell']]
    };
    const all = Object.values(sections).flat();
    if (command) {
        const found = all.find(([usage]) => usage.split(' ')[0] === command);
        return found ? `${found[0]}\n  ${found[1]}` : `No help for '${command}'.`;
    }
    return `OpenContent CLI ${pkg.version}\n\nCONTENT\n${sections.content.map(([u,d])=>`  ${u.padEnd(45)} ${d}`).join('\n')}\n\nARTIFACTS\n${sections.artifacts.map(([u,d])=>`  ${u.padEnd(45)} ${d}`).join('\n')}\n\nCONFIGURATION\n${sections.configuration.map(([u,d])=>`  ${u.padEnd(45)} ${d}`).join('\n')}\n\nLOCAL / SHELL\n${sections.local.map(([u,d])=>`  ${u.padEnd(45)} ${d}`).join('\n')}\n\nGlobal flags: --json --quiet --verbose --api <url> --help --version`;
}

async function commandStatus() {
    const config = await getClientConfig();
    const result = {
        success: true,
        api: apiBase,
        textModel: process.env.OC_ACTIVE_MODEL || config.activeTextModel || null,
        visionModel: config.activeVisionModel || null,
        imageModel: process.env.OC_ACTIVE_IMAGE_MODEL || config.activeImageModel || null,
        registeredModels: config.models?.length || 0,
        outputDirectory: DEFAULT_OUTPUT_DIR
    };
    if (outputMode.json) out(result); else out(`API        ${result.api}\nText       ${result.textModel || 'not selected'}\nVision     ${result.visionModel || 'not selected'}\nImage      ${result.imageModel || 'not selected'}\nModels     ${result.registeredModels}\nOutput     ${result.outputDirectory}`);
    return result;
}

async function commandDoctor() {
    const started = Date.now();
    let health = null;
    let config = null;
    const checks = [];
    try {
        health = await apiFetch('/api/health', { timeoutMs: Math.min(API_TIMEOUT_MS, 10000) });
        checks.push({ name: 'API', ok: true, value: apiBase });
        checks.push({ name: 'Latency', ok: true, value: `${Date.now() - started}ms` });
    } catch (error) {
        checks.push({ name: 'API', ok: false, value: error.message });
    }
    if (health) {
        try {
            config = await getClientConfig();
            checks.push({ name: 'Text model', ok: Boolean(config.activeTextModel), value: config.activeTextModel || 'not selected' });
            checks.push({ name: 'Image model', ok: Boolean(config.activeImageModel), value: config.activeImageModel || 'not selected', warning: !config.activeImageModel });
            checks.push({ name: 'Registry', ok: (config.models?.length || 0) > 0, value: `${config.models?.length || 0} models` });
        } catch (error) {
            checks.push({ name: 'Client config', ok: false, value: error.message });
        }
    }
    const result = { success: checks.every((item) => item.ok || item.warning), checks };
    if (outputMode.json) out(result);
    else {
        out(`OpenContent CLI ${pkg.version}\n`);
        for (const check of checks) out(`${check.ok ? 'OK   ' : check.warning ? 'WARN ' : 'FAIL '} ${check.name.padEnd(12)} ${check.value}`);
    }
    if (checks.some((item) => !item.ok && !item.warning)) throw new CliError('Doctor found blocking issues.', 'DOCTOR_FAILED', 2, checks);
    return result;
}

async function commandModel(args) {
    const action = args[0];
    if (action === 'list') {
        const result = await apiFetch('/api/models');
        if (outputMode.json) out(result); else out((result.models || []).map((model) => model.id || model).join('\n') || 'No models registered.');
        return result;
    }
    if (action === 'set') {
        if (!args[1]) throw new CliError('Usage: model set <model-id> [provider]', 'USAGE');
        process.env.OC_ACTIVE_MODEL = args[1];
        if (args[2]) process.env.OC_PROVIDER = args[2];
        out(outputMode.json ? { success: true, model: args[1], provider: args[2] || null } : `Model override: ${args[1]}${args[2] ? ` (${args[2]})` : ''}`);
        return;
    }
    await commandStatus();
}

async function commandGenerate(args, systemPrompt = null) {
    const prompt = stripFlags(args, ['--model','--provider']).join(' ').trim();
    if (!prompt) throw new CliError('Provide a prompt.', 'USAGE');
    const configured = await resolveCliModel('text');
    const model = flagValue(args, '--model') || process.env.OC_ACTIVE_MODEL || configured.id;
    const provider = flagValue(args, '--provider') || process.env.OC_PROVIDER || configured.provider;
    if (!model) throw new CliError('No text model selected. Choose one in OpenContent or use --model.', 'TEXT_MODEL_NOT_SELECTED');
    if (!provider) throw new CliError('No provider is configured for the selected model. Add a provider or use --provider.', 'PROVIDER_NOT_CONFIGURED');
    progress('Generating…');
    const result = await apiFetch('/api/generate', { method: 'POST', body: { prompt, model, provider, baseUrl: configured.baseUrl, max_tokens: Number(process.env.OC_MAX_TOKENS) || 1024, ...(systemPrompt ? { systemPrompt } : {}) } });
    if (!result.success) throw new CliError(result.error || 'Generation failed.', 'GENERATION_FAILED');
    const content = result.content?.trim() || '';
    await publishSession({ prompt, result: content, model: result.model || model, provider: result.provider || provider, source: 'cli', externalSource: 'cli' });
    out(outputMode.json ? { success: true, content, model: result.model || model, provider } : content);
}

async function commandImage(args) {
    const prompt = stripFlags(args, ['--out','--name','--model','--provider']).join(' ').trim();
    if (!prompt) throw new CliError('Provide an image prompt.', 'USAGE');
    const configured = await resolveCliModel('image');
    const model = flagValue(args, '--model') || process.env.OC_ACTIVE_IMAGE_MODEL || configured.id;
    const provider = flagValue(args, '--provider') || process.env.OC_IMAGE_PROVIDER || configured.provider;
    if (!model) throw new CliError('No image model selected.', 'IMAGE_MODEL_NOT_SELECTED');
    if (!provider) throw new CliError('No provider configured for the image model.', 'PROVIDER_NOT_CONFIGURED');
    progress('Generating image…');
    const result = await apiFetch('/api/generate-image', { method: 'POST', body: { prompt, model, provider, baseUrl: configured.baseUrl } });
    if (!result.success || !result.imageUrl) throw new CliError(result.error || 'Image generation failed.', 'IMAGE_GENERATION_FAILED');
    const directory = resolve(flagValue(args, '--out') || DEFAULT_OUTPUT_DIR);
    const filename = sanitizeFilename(flagValue(args, '--name') || `opencontent-${Date.now()}.png`, 'opencontent.png');
    mkdirSync(directory, { recursive: true });
    const destination = join(directory, filename);
    const bytes = result.imageUrl.startsWith('data:') ? Buffer.from(result.imageUrl.split(',')[1], 'base64') : Buffer.from(await (await fetch(result.imageUrl)).arrayBuffer());
    writeFileSync(destination, bytes);
    out(outputMode.json ? { success: true, path: destination, model, provider } : destination);
}

function commandGallery(args) {
    const action = args[0] || 'list';
    const assets = listGalleryFiles().sort((a,b) => b.modifiedAt.localeCompare(a.modifiedAt));
    if (action === 'list' || action === 'ls') {
        if (outputMode.json) out({ success: true, assets });
        else out(assets.length ? assets.map((item) => `${item.assetId}\t${item.size} bytes`).join('\n') : `Gallery is empty: ${GALLERY_DIR}`);
        return;
    }
    const asset = assets.find((item) => item.assetId === args[1] || item.assetId.endsWith(args[1] || ''));
    if (!asset) throw new CliError('Gallery asset not found.', 'ASSET_NOT_FOUND');
    if (action === 'view') return out(outputMode.json ? { success: true, asset } : JSON.stringify(asset, null, 2));
    if (action === 'clone') {
        if (process.env.OC_ALLOW_LOCAL_WRITES !== 'true') throw new CliError('Local writes are blocked. Set OC_ALLOW_LOCAL_WRITES=true.', 'LOCAL_WRITES_BLOCKED');
        const source = resolve(GALLERY_DIR, asset.assetId.replaceAll('/', process.platform === 'win32' ? '\\' : '/'));
        if (!isWithinDirectory(source, GALLERY_DIR)) throw new CliError('Invalid gallery path.', 'INVALID_GALLERY_ASSET');
        const destinationDirectory = resolveCloneDirectory(flagValue(args, '--out'));
        const destination = join(destinationDirectory, sanitizeFilename(flagValue(args, '--name') || asset.name, asset.name));
        mkdirSync(destinationDirectory, { recursive: true });
        if (existsSync(destination) && !hasFlag(args, '--force') && process.env.OC_ALLOW_OVERWRITE !== 'true') throw new CliError(`Destination exists: ${destination}. Use --force to overwrite.`, 'OVERWRITE_BLOCKED');
        copyFileSync(source, destination);
        return out(outputMode.json ? { success: true, path: destination } : destination);
    }
    throw new CliError('Usage: gallery [list|view|clone] [asset-id]', 'USAGE');
}

async function commandAgent(args) {
    const prompt = stripFlags(args, ['--model','--provider','--image-model','--image-provider']).join(' ').trim();
    if (!prompt) throw new CliError('Provide a prompt.', 'USAGE');
    const configured = await resolveCliModel('text');
    const model = flagValue(args, '--model') || process.env.OC_ACTIVE_MODEL || configured.id;
    const provider = flagValue(args, '--provider') || process.env.OC_PROVIDER || configured.provider;
    if (!model || !provider) throw new CliError('Agent requires a selected text model and provider.', 'MODEL_OR_PROVIDER_MISSING');
    progress('Running agent…');
    const result = await apiFetch('/api/agentic', { method: 'POST', body: { prompt, textModel: model, textProvider: provider, imageModel: flagValue(args, '--image-model') || process.env.OC_ACTIVE_IMAGE_MODEL, imageProvider: flagValue(args, '--image-provider') || process.env.OC_IMAGE_PROVIDER } });
    if (!result.success) throw new CliError(result.error || 'Agent failed.', 'AGENT_FAILED');
    await publishSession({ prompt, result: result.content || '', model, provider, imageUrl: result.imageUrl || null, source: 'cli', externalSource: 'cli', type: result.imageUrl ? 'agentic' : 'text', steps: result.steps });
    out(outputMode.json ? result : result.content || 'Agent completed.');
}

async function writeDocument(text, args) {
    const artifact = documentFromText(text || '', { name: flagValue(args, '--name') || 'OpenContent document' });
    const blob = serializeDocumentToPdf(artifact);
    const target = resolve(flagValue(args, '--out') || flagValue(args, '-o') || 'opencontent-document.pdf');
    writeFileSync(target, Buffer.from(await blob.arrayBuffer()));
    out(outputMode.json ? { success: true, type: 'document', path: target } : target);
}
function writeDiagram(input, args) {
    const artifact = parseDiagramDsl(input.replace(/\s*;\s*/g, '\n'));
    const target = resolve(flagValue(args, '--out') || flagValue(args, '-o') || 'opencontent-diagram.svg');
    writeFileSync(target, diagramToSvg(artifact));
    out(outputMode.json ? { success: true, type: 'diagram', path: target } : target);
}

async function runCommand(command, args = [], { interactive = false } = {}) {
    const cmd = String(command || '').toLowerCase();
    switch (cmd) {
        case 'help': return out(helpText(args[0]));
        case 'status': return commandStatus();
        case 'doctor': return commandDoctor();
        case 'model': return commandModel(args);
        case 'generate': return commandGenerate(args);
        case 'ask-editor': return commandGenerate(args, EDITOR_CONTEXT);
        case 'image': return commandImage(args);
        case 'gallery': return commandGallery(args);
        case 'agent': return commandAgent(args);
        case 'project': return out('Projects are browser-local IndexedDB data. Use the web UI for project management; remote CLI sessions still sync through /api/sessions.');
        case 'artifact': return out('Browser artifacts are local-first IndexedDB data. Use `diagram`, `document`, or `pdf create` locally, or the /api/artifacts endpoints remotely.');
        case 'diagram': {
            const input = stripFlags(args, ['--out','-o']).join(' ');
            if (!input) throw new CliError('Usage: diagram "A -> B; B -> C" [-o diagram.svg]', 'USAGE');
            return writeDiagram(input, args);
        }
        case 'document': {
            const text = stripFlags(args, ['--out','-o','--name']).join(' ');
            if (!text) throw new CliError('Usage: document <text> [-o document.pdf]', 'USAGE');
            return writeDocument(text, args);
        }
        case 'pdf': {
            if (args[0] !== 'create') throw new CliError('Usage: pdf create <text> [-o document.pdf]', 'USAGE');
            const text = stripFlags(args.slice(1), ['--out','-o','--name']).join(' ');
            if (!text) throw new CliError('Provide PDF text.', 'USAGE');
            return writeDocument(text, args.slice(1));
        }
        case 'clear': if (interactive) console.clear(); return;
        case 'exit': case 'quit': if (interactive) return { exit: true }; return;
        default: {
            const guess = suggestion(cmd);
            throw new CliError(`Unknown command '${cmd}'.${guess?.score <= 3 ? ` Did you mean '${guess.name}'?` : " Type 'help'."}`, 'UNKNOWN_COMMAND');
        }
    }
}

function consumeGlobalFlags(tokens) {
    const rest = [];
    for (let index = 0; index < tokens.length; index += 1) {
        const token = tokens[index];
        if (token === '--json') outputMode.json = true;
        else if (token === '--quiet') outputMode.quiet = true;
        else if (token === '--verbose') outputMode.verbose = true;
        else if (token === '--no-color') { /* Output is already semantic without required ANSI color. */ }
        else if (token === '--api') apiBase = tokens[++index] || apiBase;
        else rest.push(token);
    }
    return rest;
}

async function runOnce(argv) {
    const tokens = consumeGlobalFlags(argv);
    if (tokens.includes('--version') || tokens[0] === 'version') { out(pkg.version); return 0; }
    if (tokens.length === 0 || tokens[0] === '--help') { out(helpText()); return 0; }
    const [command, ...args] = tokens;
    if (args.includes('--help')) { out(helpText(command)); return 0; }
    try { await runCommand(command, args); return 0; }
    catch (error) { return fail(error); }
}

async function runShell() {
    if (!outputMode.quiet) out(`OpenContent CLI v${pkg.version}\nType 'help' for commands. 'doctor' checks connectivity.`);
    const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: 'oc> ' });
    rl.prompt();
    for await (const line of rl) {
        const input = line.trim();
        if (!input) { rl.prompt(); continue; }
        HISTORY.push(input); if (HISTORY.length > MAX_HISTORY) HISTORY.shift();
        const [command, ...args] = tokenize(input);
        try {
            const result = await runCommand(command, args, { interactive: true });
            if (result?.exit) break;
        } catch (error) { fail(error); }
        rl.prompt();
    }
    rl.close();
}

const argv = process.argv.slice(2);
if (argv.length === 0) runShell().catch((error) => { process.exitCode = fail(error); });
else runOnce(argv).then((code) => { process.exitCode = code; }).catch((error) => { process.exitCode = fail(error); });
