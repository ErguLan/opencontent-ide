// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateImageFile } from './imageFiles.js';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const resources = [];
afterEach(async () => {
    for (const cleanup of resources.splice(0).reverse()) await cleanup();
});

async function fixture(imageCapable = true) {
    let generations = 0;
    const server = createServer(async (request, response) => {
        response.setHeader('Content-Type', 'application/json');
        if (request.url === '/images/models') {
            response.end(JSON.stringify({ data: imageCapable ? [{ id: 'explicit-model', architecture: { output_modalities: ['image'] },
                supported_parameters: { output_format: { type: 'enum', values: ['png'] } } }] : [] }));
        } else if (request.url === '/models') {
            response.end(JSON.stringify({ data: [{ id: 'explicit-model', architecture: { output_modalities: ['text'] } }] }));
        } else if (request.url === '/images' && request.method === 'POST') {
            let body = '';
            for await (const chunk of request) body += chunk;
            const input = JSON.parse(body);
            if (input.model !== 'explicit-model' || input.output_format !== 'png') {
                response.writeHead(400); response.end('{}'); return;
            }
            generations += 1;
            response.end(JSON.stringify({ data: [{ b64_json: png, media_type: 'image/png' }] }));
        } else { response.writeHead(404); response.end('{}'); }
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    resources.push(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
    const root = await mkdtemp(path.join(tmpdir(), 'oc-asset-test-'));
    resources.push(() => rm(root, { recursive: true, force: true }));
    return { root, baseUrl: `http://127.0.0.1:${server.address().port}`, get generations() { return generations; },
        request: { prompt: 'A grocery store sign', model: 'explicit-model', output_path: path.join(root, 'sign.png'),
            metadata_path: path.join(root, 'sign.asset.json'), size: '1024x1024' } };
}

describe('standalone image delivery', () => {
    it('runs the real CLI against a local provider, delivers files and never persists its API key', async () => {
        const setup = await fixture();
        const requestPath = path.join(setup.root, 'request.json'), resultPath = path.join(setup.root, 'result.json');
        await writeFile(requestPath, JSON.stringify(setup.request));
        const worker = fileURLToPath(new URL('../../cli/asset-worker.js', import.meta.url));
        const child = spawn(process.execPath, [worker, '--request', requestPath, '--result', resultPath], {
            env: { ...process.env, RAF_IMAGE_PROVIDER: 'openrouter', RAF_IMAGE_BASE_URL: setup.baseUrl, RAF_IMAGE_API_KEY: 'offline-test-key' },
            stdio: 'ignore', windowsHide: true,
        });
        resources.push(() => { if (child.exitCode === null) child.kill(); });
        const exitCode = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); });
        expect(exitCode).toBe(0);
        const result = JSON.parse(await readFile(resultPath, 'utf8'));
        expect(result).toMatchObject({ ok: true, model: 'explicit-model', width: 1, height: 1 });
        expect((await readFile(result.image_path)).toString('base64')).toBe(png);
        for (const filename of [requestPath, resultPath, result.metadata_path]) {
            expect(await readFile(filename, 'utf8')).not.toContain('offline-test-key');
        }
        expect(setup.generations).toBe(1);
    });

    it('rejects an unsupported model before sending a paid generation request', async () => {
        const setup = await fixture(false);
        await expect(generateImageFile(setup.request, { provider: 'openrouter', baseUrl: setup.baseUrl, apiKey: 'unused' }))
            .rejects.toThrow('SELECTED_MODEL_DOES_NOT_ADVERTISE_IMAGE_OUTPUT');
        expect(setup.generations).toBe(0);
    });

    it('preserves an existing file and fails before generation', async () => {
        const setup = await fixture();
        await writeFile(setup.request.output_path, 'existing user image');
        await expect(generateImageFile(setup.request, { provider: 'openrouter', baseUrl: setup.baseUrl, apiKey: 'unused' }))
            .rejects.toThrow('OUTPUT_ALREADY_EXISTS');
        expect(await readFile(setup.request.output_path, 'utf8')).toBe('existing user image');
        expect(setup.generations).toBe(0);
    });
});
