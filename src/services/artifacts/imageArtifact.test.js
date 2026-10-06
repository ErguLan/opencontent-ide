/**
 * Image artifacts: a generated image must be a first-class artifact.
 *
 * These tests run against the real data layer with the in-memory IndexedDB
 * double, so they exercise storage, not mocks of it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createFakeIndexedDb } from '../../test/fakeIndexedDb';
import { closeConnection } from '../db/connection.js';
import { resetMigrationState } from '../db/migration.js';
import {
    ARTIFACT_TYPES,
    OPERATION_TYPES,
    applyArtifactOperation,
    createArtifact,
    getArtifact,
    listArtifacts,
    redoArtifact,
    saveArtifact,
    snapshotArtifact,
    undoArtifact
} from './artifactEngine.js';
import {
    IMAGE_ERROR_CODES,
    createImageArtifact,
    imageMediaAssetId,
    isImageArtifact,
    readImageArtifactAsset,
    readImageConfig
} from './imageArtifact.js';
import { applyAiArtifactOperations, validateAiArtifactOperations } from './aiArtifactOps.js';
import {
    ensureGeneratedImagesHaveArtifacts,
    regenerateImageArtifact,
    resetImageBackfillState,
    runGeneratedImageBackfill,
    saveImageArtifact
} from '../imageArtifacts.js';
import { deleteMedia, getAllMedia, getMedia, saveMedia } from '../mediaService.js';

const FIRST_IMAGE = 'data:image/png;base64,AAAA';
const SECOND_IMAGE = 'data:image/png;base64,BBBB';

const originalIndexedDB = globalThis.indexedDB;

const respondWith = (imageUrl) => ({ ok: true, blob: async () => new Blob([imageUrl], { type: 'image/png' }) });

/** Generates an image without touching the network: the provider is injected. */
const imageGenerator = (imageUrl = SECOND_IMAGE, model = 'image-model-2') => async () => ({ success: true, imageUrl, model });

const storeAsset = async (overrides = {}) => saveMedia(
    new Blob(['bytes'], { type: 'image/png' }),
    overrides.name || 'generated.png',
    { source: 'generated', kind: 'generated', prompt: 'a lighthouse', model: 'image-model', parameters: { size: '1024x1024' }, ...overrides }
);

beforeEach(async () => {
    await closeConnection();
    resetMigrationState();
    resetImageBackfillState();
    globalThis.indexedDB = createFakeIndexedDb();
    globalThis.fetch = vi.fn(async () => respondWith(FIRST_IMAGE));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(async () => {
    await closeConnection();
    resetMigrationState();
    resetImageBackfillState();
    if (originalIndexedDB === undefined) delete globalThis.indexedDB;
    else globalThis.indexedDB = originalIndexedDB;
    vi.restoreAllMocks();
});

describe('image artifact registration', () => {
    it('stores a generated image once, as an artifact that references the asset', async () => {
        const { asset, artifact } = await saveImageArtifact('https://example.test/one.png', {
            projectId: 'project_1',
            prompt: 'a lighthouse at dusk',
            model: 'image-model',
            parameters: { size: '1792x1024' }
        });

        expect(isImageArtifact(artifact)).toBe(true);
        expect(artifact.projectId).toBe('project_1');
        expect(artifact.content.mediaAssetId).toBe(asset.id);
        expect(artifact.content.prompt).toBe('a lighthouse at dusk');
        expect(artifact.content.parameters).toEqual({ size: '1792x1024' });
        expect(artifact.content.model).toBe('image-model');

        const stored = await getArtifact(artifact.id);
        expect(stored.type).toBe(ARTIFACT_TYPES.IMAGE);
        expect(stored.delivery.state).toBe('draft');
        // The bytes live in the media store and nowhere else.
        expect(JSON.stringify(stored)).not.toContain('base64');
        expect((await getMedia(asset.id)).data).toContain('base64');
        expect(await readImageArtifactAsset(stored)).toMatchObject({ id: asset.id });
    });

    it('needs the media asset, so an artifact can never point at nothing', () => {
        expect(() => createImageArtifact({ asset: { name: 'no-id.png' } })).toThrow(/IMAGE_ASSET_REQUIRED/);
    });

    it('reads image configuration only from an image artifact', () => {
        const diagram = createArtifact({ type: ARTIFACT_TYPES.DIAGRAM, content: { elements: [] } });
        expect(() => readImageConfig(diagram)).toThrow(/IMAGE_ARTIFACT_TYPE_REQUIRED/);
        expect(imageMediaAssetId(diagram)).toBeNull();
        expect(readImageConfig({ type: ARTIFACT_TYPES.IMAGE, content: null })).toEqual({ mediaAssetId: null, prompt: '', parameters: {}, model: null });
    });
});

describe('image artifact regeneration', () => {
    it('records a regeneration as an operation that undo and redo reverse', async () => {
        const first = await saveImageArtifact('https://example.test/one.png', { prompt: 'a lighthouse', model: 'image-model', parameters: { size: '1024x1024' } });

        const regenerated = await regenerateImageArtifact(first.artifact, {
            prompt: 'a lighthouse at dusk',
            parameters: { size: '1792x1024' },
            generate: imageGenerator()
        });
        const result = regenerated.artifact;

        expect(result.operations).toHaveLength(1);
        expect(result.operations[0].type).toBe(OPERATION_TYPES.SET_IMAGE_CONFIG);
        expect(result.operations[0].mediaAssetId).toBe(regenerated.asset.id);
        expect(result.operationCursor).toBe(0);
        expect(result.content.mediaAssetId).toBe(regenerated.asset.id);
        expect(result.content.mediaAssetId).not.toBe(first.asset.id);
        expect(result.content.prompt).toBe('a lighthouse at dusk');
        expect(result.content.model).toBe('image-model-2');

        // Undo returns the artifact to the image it was showing before.
        const undone = undoArtifact(result);
        expect(undone.content.mediaAssetId).toBe(first.asset.id);
        expect(undone.content.prompt).toBe('a lighthouse');
        expect(undone.content.parameters).toEqual({ size: '1024x1024' });
        expect((await readImageArtifactAsset(undone)).id).toBe(first.asset.id);

        const redone = redoArtifact(undone);
        expect(redone.content.mediaAssetId).toBe(regenerated.asset.id);
        expect(redone.content.prompt).toBe('a lighthouse at dusk');

        // The previous bytes are still stored: a history entry is not a dangling reference.
        expect(await getMedia(first.asset.id)).toBeTruthy();
        expect(regenerated.asset.parentAssetId).toBe(first.asset.id);
    });

    it('survives a save, so the version is undoable after a reload', async () => {
        const first = await saveImageArtifact('https://example.test/one.png', { prompt: 'a lighthouse' });
        const regenerated = await regenerateImageArtifact(first.artifact, { prompt: 'a lighthouse at dusk', generate: imageGenerator() });
        const versioned = snapshotArtifact(regenerated.artifact, 'second version');
        expect(versioned.versions).toHaveLength(1);
        expect(versioned.versions[0].content.mediaAssetId).toBe(regenerated.asset.id);

        const saved = await saveArtifact(versioned);
        const reloaded = await getArtifact(saved.id);
        expect(reloaded.content.mediaAssetId).toBe(regenerated.asset.id);
        expect(JSON.stringify(reloaded)).not.toContain('base64');

        const undone = undoArtifact(reloaded);
        expect(undone.content.mediaAssetId).toBe(first.asset.id);
        expect(undoArtifact(await saveArtifact(undone)).content.prompt).toBe('a lighthouse');
    });

    it('refuses to regenerate without a generator, without a prompt or with broken parameters', async () => {
        const first = await saveImageArtifact('https://example.test/one.png', { prompt: 'a lighthouse' });
        const artifact = first.artifact;

        await expect(regenerateImageArtifact(artifact, { prompt: 'x' })).rejects.toThrow(/IMAGE_GENERATOR_REQUIRED/);
        await expect(regenerateImageArtifact(createImageArtifact({ asset: { id: 'asset_x' } }), { generate: imageGenerator() })).rejects.toThrow(/IMAGE_PROMPT_REQUIRED/);
        await expect(regenerateImageArtifact(artifact, { prompt: 'x', parameters: 'nope', generate: imageGenerator() })).rejects.toThrow(/IMAGE_PARAMETERS_INVALID/);
    });

    it('reports a provider failure instead of pretending it worked', async () => {
        const first = await saveImageArtifact('https://example.test/one.png', { prompt: 'a lighthouse' });
        await expect(regenerateImageArtifact(first.artifact, {
            prompt: 'a lighthouse at dusk',
            generate: async () => ({ success: false, error: 'IMAGE_PROVIDER_TIMEOUT' })
        })).rejects.toThrow(/IMAGE_GENERATION_FAILED/);
        expect((await listArtifacts({ type: ARTIFACT_TYPES.IMAGE }))[0].operations).toHaveLength(0);
    });

    it('reports a missing asset with a code instead of rendering an empty artifact', async () => {
        const first = await saveImageArtifact('https://example.test/one.png', { prompt: 'a lighthouse' });
        await deleteMedia(first.asset.id);
        await expect(readImageArtifactAsset(first.artifact)).rejects.toMatchObject({ code: IMAGE_ERROR_CODES.ASSET_NOT_FOUND });
    });
});

describe('image artifact operation contract', () => {
    const image = () => createImageArtifact({ asset: { id: 'asset_1', name: 'one.png' }, prompt: 'a lighthouse' });

    it('rejects an image configuration without the asset it produced', () => {
        expect(() => applyArtifactOperation(image(), { type: OPERATION_TYPES.SET_IMAGE_CONFIG, prompt: 'no asset' })).toThrow(/mediaAssetId/);
        expect(() => applyArtifactOperation(image(), { type: OPERATION_TYPES.SET_IMAGE_CONFIG, mediaAssetId: 'asset_2', prompt: '  ' })).toThrow(/non-empty prompt/);
        expect(() => applyArtifactOperation(image(), { type: OPERATION_TYPES.SET_IMAGE_CONFIG, mediaAssetId: 'asset_2', prompt: 'ok', parameters: 'nope' })).toThrow(/parameters to be an object/);
    });

    it('rejects an image configuration on another artifact type', () => {
        const diagram = createArtifact({ type: ARTIFACT_TYPES.DIAGRAM, content: { elements: [] } });
        expect(() => applyArtifactOperation(diagram, { type: OPERATION_TYPES.SET_IMAGE_CONFIG, mediaAssetId: 'asset_2', prompt: 'ok' })).toThrow(/not allowed on a diagram artifact/);
    });

    it('leaves the other artifact types untouched', () => {
        expect(() => applyArtifactOperation(createArtifact({ type: ARTIFACT_TYPES.DOCUMENT }), { type: OPERATION_TYPES.ADD_PAGE, page: { id: 'p1' } })).not.toThrow();
        expect(() => applyArtifactOperation(createArtifact({ type: ARTIFACT_TYPES.DIAGRAM }), { type: OPERATION_TYPES.ADD_ELEMENT, element: { id: 'a' } })).not.toThrow();
    });
});

describe('image artifact AI safety', () => {
    const image = () => createImageArtifact({ asset: { id: 'asset_1', name: 'one.png' }, prompt: 'a lighthouse' });

    it('gives the planner no way to regenerate or rewire an image', () => {
        expect(() => validateAiArtifactOperations([{ action: 'set_image_config', mediaAssetId: 'asset_1', prompt: 'x' }], { type: ARTIFACT_TYPES.IMAGE })).toThrow(/Unsafe or unsupported AI action/);
        expect(() => validateAiArtifactOperations([{ action: 'regenerate_image', prompt: 'x' }], { type: ARTIFACT_TYPES.IMAGE })).toThrow(/Unsafe or unsupported AI action/);
    });

    it('refuses a document action aimed at an image artifact', () => {
        expect(() => validateAiArtifactOperations([{ action: 'set_document_text', text: 'x' }], { type: ARTIFACT_TYPES.IMAGE })).toThrow(/does not apply to a image artifact/);
        expect(() => applyAiArtifactOperations(image(), [{ action: 'set_document_text', text: 'x' }])).toThrow(/does not apply to a image artifact/);
        expect(() => applyAiArtifactOperations(image(), [{ action: 'add_page', page: { id: 'p1' } }])).toThrow(/does not apply to a image artifact/);
        expect(applyAiArtifactOperations(image(), [{ action: 'set_metadata', patch: { title: 'Lighthouse' } }]).metadata.title).toBe('Lighthouse');
    });

    it('still validates the diagram actions against a diagram', () => {
        const diagram = createArtifact({ type: ARTIFACT_TYPES.DIAGRAM, content: { elements: [] } });
        expect(() => validateAiArtifactOperations([{ action: 'add_annotation', text: 'x' }], { type: ARTIFACT_TYPES.DIAGRAM })).toThrow(/does not apply to a diagram artifact/);
        expect(applyAiArtifactOperations(diagram, [{ action: 'add_node', node: { id: 'a', label: 'A' } }]).content.elements).toHaveLength(1);
    });
});

describe('images stored before image artifacts existed', () => {
    it('adopts every generated image without an artifact, exactly once', async () => {
        const legacy = await storeAsset({ name: 'legacy.png', prompt: 'legacy prompt', status: 'approved' });
        const upload = await storeAsset({ name: 'logo.png', source: 'upload', kind: 'source', role: 'logo' });

        const first = await ensureGeneratedImagesHaveArtifacts();
        expect(first.status).toBe('loaded');
        expect(first.created).toBe(1);

        const artifacts = await listArtifacts();
        expect(artifacts).toHaveLength(1);
        expect(artifacts[0].type).toBe(ARTIFACT_TYPES.IMAGE);
        expect(artifacts[0].content.mediaAssetId).toBe(legacy.id);
        expect(artifacts[0].content.prompt).toBe('legacy prompt');
        expect(artifacts[0].content.parameters).toEqual({ size: '1024x1024' });
        // The delivery state the asset already had is not thrown away.
        expect(artifacts[0].delivery.state).toBe('approved');

        const second = await runGeneratedImageBackfill();
        expect(second.created).toBe(0);
        expect(await listArtifacts()).toHaveLength(1);
        // Nothing was deleted or rewritten.
        expect(await getAllMedia()).toHaveLength(2);
        expect(upload).toBeTruthy();
        expect((await getMedia(legacy.id)).data).toContain('base64');

        // The memoized entry point hands the same report to every caller.
        const memoized = ensureGeneratedImagesHaveArtifacts();
        expect(await ensureGeneratedImagesHaveArtifacts()).toBe(await memoized);
    });

    it('leaves an upload alone and adopts nothing', async () => {
        await storeAsset({ source: 'upload', kind: 'source', role: 'template' });
        const report = await ensureGeneratedImagesHaveArtifacts();
        expect(report.created).toBe(0);
        expect(await listArtifacts()).toHaveLength(0);
    });

    it('does not adopt an image that already has an artifact', async () => {
        const saved = await saveImageArtifact('https://example.test/one.png', { prompt: 'a lighthouse' });
        const report = await ensureGeneratedImagesHaveArtifacts();
        expect(report.created).toBe(0);
        expect(report.skipped).toBe(1);
        expect((await listArtifacts()).map((artifact) => artifact.id)).toEqual([saved.artifact.id]);
    });
});