#!/usr/bin/env node
/**
 * OpenContent CLI
 * Node 20+ standalone/remote interface.
 *
 * `opencontent`                    interactive shell
 * `opencontent doctor`             connectivity diagnostics
 * `opencontent generate "..."`     one-shot/script mode
 * `opencontent diagram "A -> B"`   local SVG artifact
 * `opencontent document "..."`     local PDF artifact
 */
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, basename, extname, relative, delimiter } from 'node:path';
import { readFileSync, mkdirSync, writeFileSync, readdirSync, statSync, copyFileSync, existsSync } from 'node:fs';
import { EDITOR_CONTEXT } from '../server/lib/editorContext.js';
import { parseDiagramDsl, diagramToSvg } from '../src/services/artifacts/diagramEngine.js';
import { documentFromText, serializeDocumentToPdf } from '../src/services/artifacts/pdfEngine.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(ROOT, '..', 'package.json'), 'utf8'));
const DEFAULT_OUTPUT = resolve(process.env.OC_OUTPUT_DIR || join(process.cwd(), 'opencontent-artifacts'));
const GALLERY_DIR = resolve(process.env.OC_GALLERY_DIR || join(process.cwd(), 'gallery'));
const TIMEOUT_MS = Number(process.env.OC_API_TIMEOUT_MS) || 60000;
const COMMAND_NAMES = ['help','status','doctor','model','generate','ask-editor','image','agent','gallery','project','artifact','diagram','document','pdf','clear','exit'];

let apiBase = process.env.OC_API_URL || 'http://localhost:4000';
let mode = { json: false, quiet: false, verbose: process.env.OC_DEBUG_LOGS === 'true' };

class CliError extends Error {
    constructor(message, code = 'CLI_ERROR', exitCode = 1, details = null) {
        super(message);
        this.code = code;
        this.exitCode = exitCode;
        this.details = details;
    }
}

function stdout(value) {
    if (mode.json && typeof value !== 'string') process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
    else process.stdout.write(`${typeof value === 'string' ? value : JSON.stringify(value, null, 2)}\n`);
}
function progress(message) { if (!mode.quiet && !mode.json) process.stderr.write(`${message}\n`); }
function debug(message, details = {}) { if (mode.verbose) process.stderr.write(`[debug] ${message} ${JSON.stringify(details)}\n`); }
function reportError(error) {
    const value = error instanceof CliError ? error : new CliError(error?.message || String(error));
    if (mode.json) process.stderr.write(`${JSON.stringify({ success: false, error: value.code, message: value.message, details: value.details }, null, 2)}\n`);
    else process.stderr.write(`ERROR ${value.message}\n`);
    return value.exitCode;
}

function tokenize(input) {
    return input.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)?.map((token) => token.replace(/^["']|["']$/g, '')) || [];
}

function parseArgs(tokens) {
    const positional = [];
    const flags = {};
    for (let index = 0; index < tokens.length; index += 1) {
        const token = tokens[index];
        if (!token.startsWith('-') || token === '-') {
            positional.push(token);
            continue;
        }
        const key = token === '-o' ? 'out' : token.replace(/^--?/, '');
        const next = tokens[index + 1];
        if (next !== undefined && (!next.startsWith('-') || /^-?\d/.test(next))) {
            flags[key] = next;
            index += 1;
        } else flags[key] = true;
    }
    return { positional, flags };
}

function consumeGlobalFlags(tokens) {
    const rest = [];
    for (let index = 0; index < tokens.length; index += 1) {
        const token = tokens[index];
        if (token === '--json') mode.json = true;
        else if (token === '--quiet') mode.quiet = true;
        else if (token === '--verbose') mode.verbose = true;
        else if (token === '--no-color') { /* No ANSI is required by this CLI. */ }
        else if (token === '--api') apiBase = tokens[++index] || apiBase;
        else rest.push(token);
    }
    return rest;
}

async function api(endpoint, { method = 'GET', body, timeout = TIMEOUT_MS } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const url = new URL(endpoint, apiBase);
    debug('request', { method, url: String(url) });
    try {
        const response = await fetch(url, {
            method,
            headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: controller.signal
        });
        const raw = await response.text();
        let data;
        try { data = raw ? JSON.parse(raw) : {}; } catch { data = { error: raw || `HTTP_${response.status}` }; }
        if (!response.ok) throw new CliError(data.error || `HTTP ${response.status}`, 'REMOTE_ERROR', 1, { status: response.status, endpoint });
        return data;
    } catch (error) {
        if (error?.name === 'AbortError') throw new CliError(`Request timed out after ${timeout}ms.`, 'API_TIMEOUT');
        if (error instanceof CliError) throw error;
        throw new CliError(`Cannot reach ${apiBase}: ${error.message}`, 'API_UNREACHABLE');
    } finally {
        clearTimeout(timer);
    }
}

async function config() {
    try { return (await api('/api/client-config')).config || {}; }
    catch { return {}; }
}
async function selectedModel(kind) {
    const current = await config();
    const id = kind === 'image' ? current.activeImageModel : kind === 'vision' ? current.activeVisionModel : current.activeTextModel;
    const model = current.models?.find((item) => item.id === id);
    return { id: id || null, provider: model?.provider || null, baseUrl: model?.baseUrl || null };
}

function distance(left, right) {
    const a = String(left), b = String(right);
    const table = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
    for (let i = 0; i <= a.length; i += 1) table[i][0] = i;
    for (let j = 0; j <= b.length; j += 1) table[0][j] = j;
    for (let i = 1; i <= a.length; i += 1) for (let j = 1; j <= b.length; j += 1) table[i][j] = Math.min(table[i-1][j]+1, table[i][j-1]+1, table[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
    return table[a.length][b.length];
}
function suggest(command) {
    const result = COMMAND_NAMES.map((name) => ({ name, score: distance(command, name) })).sort((a,b) => a.score-b.score)[0];
    return result?.score <= Math.max(2, Math.floor(command.length / 2)) ? result.name : null;
}

function help(command) {
    const rows = [
        ['generate <prompt> [--model id --provider name]', 'Generate text through the remote API'],
        ['image <prompt> [-o dir --name file]', 'Generate and save an image'],
        ['agent <prompt>', 'Run the coordinated remote agent'],
        ['diagram "A -> B; B -> C" [-o file.svg]', 'Create a local structured diagram'],
        ['document <text> [-o file.pdf]', 'Create a local PDF document'],
        ['pdf create <text> [-o file.pdf]', 'Create a local PDF document'],
        ['status', 'Show current API/model context'],
        ['doctor', 'Test API/model connectivity'],
        ['model list', 'List remote registered models'],
        ['model set <id> [provider]', 'Temporary CLI model override'],
        ['gallery [list|view|clone] [id]', 'Inspect the filesystem gallery'],
        ['artifact', 'Explain browser-local artifact scope'],
        ['project', 'Explain browser-local project scope'],
        ['clear', 'Clear interactive shell'],
        ['exit', 'Exit interactive shell']
    ];
    if (command) {
        const row = rows.find(([usage]) => usage.split(' ')[0] === command);
        return row ? `${row[0]}\n  ${row[1]}` : `No help for '${command}'.`;
    }
    const content = rows.slice(0, 6), configRows = rows.slice(6, 10), localRows = rows.slice(10);
    const render = (title, list) => `${title}\n${list.map(([usage, description]) => `  ${usage.padEnd(49)} ${description}`).join('\n')}`;
    return `OpenContent CLI ${pkg.version}\n\n${render('CONTENT & ARTIFACTS', content)}\n\n${render('CONFIGURATION', configRows)}\n\n${render('LOCAL / SHELL', localRows)}\n\nGlobal: --json --quiet --verbose --api <url> --help --version`;
}

async function status() {
    const current = await config();
    const result = {
        success: true,
        api: apiBase,
        textModel: process.env.OC_ACTIVE_MODEL || current.activeTextModel || null,
        visionModel: current.activeVisionModel || null,
        imageModel: process.env.OC_ACTIVE_IMAGE_MODEL || current.activeImageModel || null,
        registeredModels: current.models?.length || 0,
        outputDirectory: DEFAULT_OUTPUT
    };
    if (mode.json) stdout(result);
    else stdout(`API        ${result.api}\nText       ${result.textModel || 'not selected'}\nVision     ${result.visionModel || 'not selected'}\nImage      ${result.imageModel || 'not selected'}\nModels     ${result.registeredModels}\nOutput     ${result.outputDirectory}`);
}

async function doctor() {
    const checks = [];
    const started = Date.now();
    try {
        await api('/api/health', { timeout: Math.min(TIMEOUT_MS, 10000) });
        checks.push({ name: 'API', state: 'OK', value: apiBase });
        checks.push({ name: 'Latency', state: 'OK', value: `${Date.now() - started}ms` });
        const current = await config();
        checks.push({ name: 'Registry', state: current.models?.length ? 'OK' : 'FAIL', value: `${current.models?.length || 0} models` });
        checks.push({ name: 'Text model', state: current.activeTextModel ? 'OK' : 'FAIL', value: current.activeTextModel || 'not selected' });
        checks.push({ name: 'Image model', state: current.activeImageModel ? 'OK' : 'WARN', value: current.activeImageModel || 'not selected' });
    } catch (error) {
        checks.push({ name: 'API', state: 'FAIL', value: error.message });
    }
    if (mode.json) stdout({ success: !checks.some((item) => item.state === 'FAIL'), checks });
    else {
        stdout(`OpenContent CLI ${pkg.version}\n`);
        checks.forEach((item) => stdout(`${item.state.padEnd(5)} ${item.name.padEnd(12)} ${item.value}`));
    }
    if (checks.some((item) => item.state === 'FAIL')) throw new CliError('Doctor found blocking issues.', 'DOCTOR_FAILED', 2, checks);
}

async function generate(tokens, systemPrompt = null) {
    const { positional, flags } = parseArgs(tokens);
    const prompt = positional.join(' ').trim();
    if (!prompt) throw new CliError('Provide a prompt.', 'USAGE');
    const active = await selectedModel('text');
    const model = flags.model || process.env.OC_ACTIVE_MODEL || active.id;
    const provider = flags.provider || process.env.OC_PROVIDER || active.provider;
    if (!model) throw new CliError('No text model selected. Choose one in OpenContent or use --model.', 'TEXT_MODEL_NOT_SELECTED');
    if (!provider) throw new CliError('No provider configured for that model. Add a provider or use --provider.', 'PROVIDER_NOT_CONFIGURED');
    progress('Generating…');
    const result = await api('/api/generate', { method: 'POST', body: { prompt, model, provider, baseUrl: active.baseUrl, max_tokens: Number(flags['max-tokens']) || 1024, ...(systemPrompt ? { systemPrompt } : {}) } });
    if (!result.success) throw new CliError(result.error || 'Generation failed.', 'GENERATION_FAILED');
    stdout(mode.json ? { success: true, content: result.content || '', model: result.model || model, provider } : (result.content || '').trim());
    api('/api/sessions', { method: 'POST', body: { prompt, result: result.content || '', model: result.model || model, provider, source: 'cli', externalSource: 'cli' } }).catch(() => {});
}

async function image(tokens) {
    const { positional, flags } = parseArgs(tokens);
    const prompt = positional.join(' ').trim();
    if (!prompt) throw new CliError('Provide an image prompt.', 'USAGE');
    const active = await selectedModel('image');
    const model = flags.model || process.env.OC_ACTIVE_IMAGE_MODEL || active.id;
    const provider = flags.provider || process.env.OC_IMAGE_PROVIDER || active.provider;
    if (!model) throw new CliError('No image model selected.', 'IMAGE_MODEL_NOT_SELECTED');
    if (!provider) throw new CliError('No provider configured for that image model.', 'PROVIDER_NOT_CONFIGURED');
    progress('Generating image…');
    const result = await api('/api/generate-image', { method: 'POST', body: { prompt, model, provider, baseUrl: active.baseUrl } });
    if (!result.success || !result.imageUrl) throw new CliError(result.error || 'Image generation failed.', 'IMAGE_GENERATION_FAILED');
    const directory = resolve(flags.out || DEFAULT_OUTPUT);
    const filename = basename(String(flags.name || `opencontent-${Date.now()}.png`).replace(/[<>:"/\\|?*]/g, '-'));
    mkdirSync(directory, { recursive: true });
    const target = join(directory, filename);
    const bytes = result.imageUrl.startsWith('data:') ? Buffer.from(result.imageUrl.split(',')[1], 'base64') : Buffer.from(await (await fetch(result.imageUrl)).arrayBuffer());
    writeFileSync(target, bytes);
    stdout(mode.json ? { success: true, path: target, model, provider } : target);
}

async function agent(tokens) {
    const { positional, flags } = parseArgs(tokens);
    const prompt = positional.join(' ').trim();
    if (!prompt) throw new CliError('Provide a prompt.', 'USAGE');
    const active = await selectedModel('text');
    const model = flags.model || process.env.OC_ACTIVE_MODEL || active.id;
    const provider = flags.provider || process.env.OC_PROVIDER || active.provider;
    if (!model || !provider) throw new CliError('Agent requires a selected text model and provider.', 'MODEL_OR_PROVIDER_MISSING');
    progress('Running agent…');
    const result = await api('/api/agentic', { method: 'POST', body: { prompt, textModel: model, textProvider: provider, imageModel: flags['image-model'] || process.env.OC_ACTIVE_IMAGE_MODEL, imageProvider: flags['image-provider'] || process.env.OC_IMAGE_PROVIDER } });
    if (!result.success) throw new CliError(result.error || 'Agent failed.', 'AGENT_FAILED');
    stdout(mode.json ? result : result.content || 'Agent completed.');
}

function gallery(tokens) {
    const { positional, flags } = parseArgs(tokens);
    const action = positional[0] || 'list';
    const files = [];
    const extensions = new Set(['.avif','.gif','.jpeg','.jpg','.png','.svg','.webp']);
    const walk = (directory = GALLERY_DIR, prefix = '') => {
        if (!existsSync(directory)) return;
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
            const absolute = join(directory, entry.name), rel = join(prefix, entry.name);
            if (entry.isDirectory()) walk(absolute, rel);
            else if (extensions.has(extname(entry.name).toLowerCase())) { const info = statSync(absolute); files.push({ id: rel.replaceAll('\\','/'), name: entry.name, size: info.size, modifiedAt: info.mtime.toISOString() }); }
        }
    };
    walk();
    if (action === 'list' || action === 'ls') return stdout(mode.json ? { success: true, assets: files } : files.map((item) => `${item.id}\t${item.size} bytes`).join('\n') || `Gallery is empty: ${GALLERY_DIR}`);
    const found = files.find((item) => item.id === positional[1] || item.id.endsWith(positional[1] || ''));
    if (!found) throw new CliError('Gallery asset not found.', 'ASSET_NOT_FOUND');
    if (action === 'view') return stdout(mode.json ? { success: true, asset: found } : JSON.stringify(found, null, 2));
    if (action !== 'clone') throw new CliError('Usage: gallery [list|view|clone] [id]', 'USAGE');
    if (process.env.OC_ALLOW_LOCAL_WRITES !== 'true') throw new CliError('Local writes are blocked. Set OC_ALLOW_LOCAL_WRITES=true.', 'LOCAL_WRITES_BLOCKED');
    const roots = [DEFAULT_OUTPUT, ...(process.env.OC_ALLOWED_CLONE_DIRS || '').split(delimiter).map((item) => item.trim()).filter(Boolean).map(resolve)];
    const destinationDir = resolve(flags.out || DEFAULT_OUTPUT);
    const allowed = roots.some((root) => { const rel = relative(root, destinationDir); return rel === '' || (!rel.startsWith('..') && !resolve(rel).startsWith('..')); });
    if (!allowed) throw new CliError('Clone destination is not allowed.', 'CLONE_DESTINATION_NOT_ALLOWED');
    const source = resolve(GALLERY_DIR, found.id);
    const target = join(destinationDir, basename(flags.name || found.name));
    mkdirSync(destinationDir, { recursive: true });
    if (existsSync(target) && !flags.force && process.env.OC_ALLOW_OVERWRITE !== 'true') throw new CliError(`Destination exists: ${target}. Use --force.`, 'OVERWRITE_BLOCKED');
    copyFileSync(source, target);
    stdout(mode.json ? { success: true, path: target } : target);
}

async function diagram(tokens) {
    const { positional, flags } = parseArgs(tokens);
    const dsl = positional.join(' ').trim();
    if (!dsl) throw new CliError('Usage: diagram "A -> B; B -> C" [-o diagram.svg]', 'USAGE');
    const artifact = parseDiagramDsl(dsl.replace(/\s*;\s*/g, '\n'));
    const target = resolve(flags.out || 'opencontent-diagram.svg');
    writeFileSync(target, diagramToSvg(artifact));
    stdout(mode.json ? { success: true, type: 'diagram', path: target } : target);
}

async function document(tokens) {
    const { positional, flags } = parseArgs(tokens);
    const text = positional.join(' ').trim();
    if (!text) throw new CliError('Provide document text.', 'USAGE');
    const artifact = documentFromText(text, { name: flags.name || 'OpenContent document' });
    const blob = serializeDocumentToPdf(artifact);
    const target = resolve(flags.out || 'opencontent-document.pdf');
    writeFileSync(target, Buffer.from(await blob.arrayBuffer()));
    stdout(mode.json ? { success: true, type: 'document', path: target } : target);
}

async function model(tokens) {
    const { positional } = parseArgs(tokens);
    const action = positional[0] || 'status';
    if (action === 'list') {
        const result = await api('/api/models');
        return stdout(mode.json ? result : (result.models || []).map((item) => item.id || item).join('\n') || 'No models registered.');
    }
    if (action === 'set') {
        if (!positional[1]) throw new CliError('Usage: model set <id> [provider]', 'USAGE');
        process.env.OC_ACTIVE_MODEL = positional[1];
        if (positional[2]) process.env.OC_PROVIDER = positional[2];
        return stdout(mode.json ? { success: true, model: positional[1], provider: positional[2] || null } : `Model override: ${positional[1]}${positional[2] ? ` (${positional[2]})` : ''}`);
    }
    return status();
}

async function run(command, tokens, interactive = false) {
    switch (String(command || '').toLowerCase()) {
        case 'help': return stdout(help(tokens[0]));
        case 'status': return status();
        case 'doctor': return doctor();
        case 'model': return model(tokens);
        case 'generate': return generate(tokens);
        case 'ask-editor': return generate(tokens, EDITOR_CONTEXT);
        case 'image': return image(tokens);
        case 'agent': return agent(tokens);
        case 'gallery': return gallery(tokens);
        case 'diagram': return diagram(tokens);
        case 'document': return document(tokens);
        case 'pdf': if (tokens[0] !== 'create') throw new CliError('Usage: pdf create <text> [-o file.pdf]', 'USAGE'); return document(tokens.slice(1));
        case 'artifact': return stdout('Browser artifacts are local-first IndexedDB data. Use diagram/document locally or /api/artifacts remotely.');
        case 'project': return stdout('Projects are browser-local IndexedDB data. Remote CLI generations can still sync through /api/sessions.');
        case 'clear': if (interactive) console.clear(); return;
        case 'exit': case 'quit': return interactive ? { exit: true } : undefined;
        default: {
            const guess = suggest(String(command || ''));
            throw new CliError(`Unknown command '${command}'.${guess ? ` Did you mean '${guess}'?` : " Type 'help'."}`, 'UNKNOWN_COMMAND');
        }
    }
}

async function once(argv) {
    const tokens = consumeGlobalFlags(argv);
    if (tokens.includes('--version') || tokens[0] === 'version') { stdout(pkg.version); return 0; }
    if (!tokens.length || tokens[0] === '--help') { stdout(help()); return 0; }
    const [command, ...args] = tokens;
    if (args.includes('--help')) { stdout(help(command)); return 0; }
    try { await run(command, args); return 0; } catch (error) { return reportError(error); }
}

async function shell() {
    stdout(`OpenContent CLI v${pkg.version}\nType 'help' for commands. Run 'doctor' for diagnostics.`);
    const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: 'oc> ', historySize: 100 });
    rl.prompt();
    for await (const line of rl) {
        const [command, ...args] = tokenize(line.trim());
        if (!command) { rl.prompt(); continue; }
        try {
            const result = await run(command, args, true);
            if (result?.exit) break;
        } catch (error) { reportError(error); }
        rl.prompt();
    }
    rl.close();
}

const argv = process.argv.slice(2);
if (!argv.length) shell().catch((error) => { process.exitCode = reportError(error); });
else once(argv).then((code) => { process.exitCode = code; }).catch((error) => { process.exitCode = reportError(error); });
