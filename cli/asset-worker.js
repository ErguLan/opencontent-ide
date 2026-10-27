#!/usr/bin/env node
/** Standalone asset CLI. Only Node 20+ is needed; no Express, browser or npm install. */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateImageFile } from '../server/lib/imageFiles.js';

export async function runAssetWorker(argv) {
    const option = (key) => {
        const index = argv.indexOf(key);
        return index < 0 ? undefined : argv[index + 1];
    };
    if (argv.includes('--help')) {
        process.stdout.write('asset --request <absolute-request.json> --result <absolute-result.json>\n'
            + 'Credentials: RAF_IMAGE_PROVIDER, RAF_IMAGE_BASE_URL, RAF_IMAGE_API_KEY (environment only).\n');
        return 0;
    }
    const requestPath = option('--request'), resultPath = option('--result');
    if (!path.isAbsolute(requestPath || '') || !path.isAbsolute(resultPath || '') || requestPath === resultPath) {
        throw new Error('ABSOLUTE_DISTINCT_REQUEST_AND_RESULT_PATHS_REQUIRED');
    }
    const apiKey = process.env.RAF_IMAGE_API_KEY;
    try {
        const request = JSON.parse(await readFile(requestPath, 'utf8'));
        const result = await generateImageFile(request, {
            provider: process.env.RAF_IMAGE_PROVIDER || process.env.OC_PROVIDER,
            baseUrl: process.env.RAF_IMAGE_BASE_URL,
            apiKey,
        });
        await writeFile(resultPath, JSON.stringify(result), { flag: 'wx' });
        return 0;
    } catch (error) {
        const detail = String(error.message || error);
        const safeMessage = apiKey ? detail.replaceAll(apiKey, '[redacted]') : detail;
        await writeFile(resultPath, JSON.stringify({ ok: false, error: safeMessage }), { flag: 'wx' });
        return 1;
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    runAssetWorker(process.argv.slice(2)).then((code) => { process.exitCode = code; })
        .catch(() => { process.stderr.write('ASSET_WORKER_FAILED\n'); process.exitCode = 1; });
}
