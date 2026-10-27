/** File delivery shared by standalone CLI workers and MCP. No browser or server required. */
import { access, mkdir, realpath, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { generateImageProvider } from './providers.js';

const MAX_IMAGE_BYTES = 32 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export function inspectPng(bytes) {
    if (bytes.length < 45 || bytes.length > MAX_IMAGE_BYTES || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)
        || bytes.toString('ascii', 12, 16) !== 'IHDR' || bytes.readUInt32BE(8) !== 13
        || bytes.toString('ascii', bytes.length - 8, bytes.length - 4) !== 'IEND') {
        throw new Error('INVALID_PNG_OUTPUT');
    }
    const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
    if (!width || !height || width > 8192 || height > 8192 || width * height > 8 * 1024 * 1024) {
        throw new Error('IMAGE_DIMENSIONS_EXCEED_IMPORT_LIMIT');
    }
    return { width, height, mediaType: 'image/png', bytes: bytes.length };
}

export async function imageBytes(imageUrl) {
    if (typeof imageUrl !== 'string' || !imageUrl) throw new Error('NO_IMAGE_IN_RESPONSE');
    const inline = imageUrl.match(/^data:image\/[^;,]+;base64,([A-Za-z0-9+/=\r\n]+)$/);
    if (inline) {
        if (inline[1].length > MAX_IMAGE_BYTES * 4 / 3 + 8) throw new Error('IMAGE_OUTPUT_TOO_LARGE');
        return Buffer.from(inline[1], 'base64');
    }
    if (new URL(imageUrl).protocol !== 'https:') throw new Error('IMAGE_DOWNLOAD_REQUIRES_HTTPS');
    const response = await fetch(imageUrl, { signal: AbortSignal.timeout(180000), redirect: 'error' });
    if (!response.ok) throw new Error(`IMAGE_DOWNLOAD_HTTP_${response.status}`);
    const chunks = [];
    let length = 0;
    for await (const chunk of response.body) {
        length += chunk.length;
        if (length > MAX_IMAGE_BYTES) throw new Error('IMAGE_OUTPUT_TOO_LARGE');
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

async function requireNewFile(filename) {
    try { await access(filename); } catch (error) {
        if (error.code === 'ENOENT') return;
        throw error;
    }
    throw new Error('OUTPUT_ALREADY_EXISTS');
}

export async function generateImageFile(request, credentials = {}) {
    const { prompt, model, output_path: outputPath, metadata_path: metadataPath } = request;
    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 8000) throw new Error('INVALID_IMAGE_PROMPT');
    if (typeof model !== 'string' || !model.trim()) throw new Error('MODEL_REQUIRED');
    if (!path.isAbsolute(outputPath || '') || !path.isAbsolute(metadataPath || '')
        || path.dirname(outputPath) !== path.dirname(metadataPath) || path.extname(outputPath).toLowerCase() !== '.png') {
        throw new Error('EXPLICIT_ABSOLUTE_PNG_AND_METADATA_PATHS_REQUIRED');
    }
    await mkdir(path.dirname(outputPath), { recursive: true });
    const directory = await realpath(path.dirname(outputPath));
    const imageFile = path.join(directory, path.basename(outputPath));
    const metadataFile = path.join(directory, path.basename(metadataPath));
    await requireNewFile(imageFile);
    await requireNewFile(metadataFile);
    const generated = await generateImageProvider({
        prompt, model, provider: credentials.provider, baseUrl: credentials.baseUrl, apiKey: credentials.apiKey,
        options: { size: request.size || '1024x1024', output_format: 'png',
            ...(request.transparent ? { background: 'transparent' } : {}) },
    });
    const bytes = await imageBytes(generated.imageUrl);
    const dimensions = inspectPng(bytes);
    const metadata = { kind: 'generated_image', provider: generated.provider, model: generated.model,
        generation_mode: 'external_studio', prompt, ...dimensions, image_file: path.basename(imageFile),
        capabilities: generated.capabilities, created_at: new Date().toISOString() };
    // Exclusive creation protects existing images, including concurrent requests.
    await writeFile(imageFile, bytes, { flag: 'wx' });
    try { await writeFile(metadataFile, JSON.stringify(metadata, null, 2), { flag: 'wx' }); }
    catch (error) { await unlink(imageFile); throw error; }
    return { ok: true, image_path: imageFile, metadata_path: metadataFile, ...dimensions,
        model: generated.model, provider: generated.provider };
}
