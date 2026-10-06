import { describe, expect, it } from 'vitest';

import { OPERATION_TYPES, applyArtifactOperation } from '../../services/artifacts/artifactEngine';
import { createImageArtifact } from '../../services/artifacts/imageArtifact';
import { buildLibraryEntries } from './libraryItems';

const generatedAsset = (overrides = {}) => ({
    id: 'asset_1',
    name: 'lighthouse.png',
    type: 'image/png',
    data: 'data:image/png;base64,AAAA',
    source: 'generated',
    kind: 'generated',
    role: 'reference',
    status: 'draft',
    prompt: 'a lighthouse',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...overrides
});

const upload = generatedAsset({ id: 'asset_2', name: 'logo.png', source: 'upload', kind: 'source', role: 'logo', prompt: null });

const imageArtifact = (asset = generatedAsset(), overrides = {}) => ({
    ...createImageArtifact({ asset, prompt: 'a lighthouse', parameters: { size: '1024x1024' } }),
    ...overrides
});

describe('library entries', () => {
    it('shows a generated image once, as its artifact', () => {
        const entries = buildLibraryEntries({ media: [generatedAsset(), upload], artifacts: [imageArtifact()] });

        expect(entries).toHaveLength(2);
        const image = entries.find((entry) => entry.libraryType === 'image');
        expect(image.libraryKind).toBe('artifact');
        expect(image.content.mediaAssetId).toBe('asset_1');
        // The bytes are shown from the asset already in memory, not copied.
        expect(image.data).toBe(generatedAsset().data);
        expect(entries.filter((entry) => entry.libraryKind === 'media').map((entry) => entry.id)).toEqual(['asset_2']);
    });

    it('keeps showing a generated image that has no artifact yet', () => {
        const entries = buildLibraryEntries({ media: [generatedAsset()], artifacts: [] });
        expect(entries).toHaveLength(1);
        expect(entries[0].libraryKind).toBe('media');
    });

    it('never lists the same asset twice, whatever the order of the input', () => {
        const asset = generatedAsset();
        const artifact = imageArtifact(asset);
        const forward = buildLibraryEntries({ media: [asset, upload], artifacts: [artifact] });
        const reversed = buildLibraryEntries({ media: [upload, asset], artifacts: [artifact] });
        expect(forward.map((entry) => `${entry.libraryKind}-${entry.id}`).sort())
            .toEqual(reversed.map((entry) => `${entry.libraryKind}-${entry.id}`).sort());
        expect(new Set(forward.map((entry) => `${entry.libraryKind}-${entry.id}`)).size).toBe(forward.length);
    });

    it('exposes the generation configuration of an image artifact', () => {
        const [entry] = buildLibraryEntries({ media: [generatedAsset()], artifacts: [imageArtifact()] });
        expect(entry.prompt).toBe('a lighthouse');
        expect(entry.model).toBeNull();
        expect(entry.deliveryState).toBe('draft');
    });

    it('marks a regenerated image as needing review once it left the draft', () => {
        const asset = generatedAsset();
        const reviewed = applyArtifactOperation(imageArtifact(asset), { type: OPERATION_TYPES.SET_DELIVERY_STATE, state: 'in-review' });
        const regenerated = applyArtifactOperation(reviewed, { type: OPERATION_TYPES.SET_IMAGE_CONFIG, mediaAssetId: 'asset_9', prompt: 'a lighthouse at dusk' });

        const entries = buildLibraryEntries({ media: [asset], artifacts: [regenerated] });
        expect(entries[0].deliveryState).toBe('in-review');
        expect(entries[0].needsReview).toBe(true);
    });

    it('leaves non-image artifacts alone', () => {
        const document = { id: 'artifact_1', type: 'document', name: 'Brief', content: { pages: [] }, delivery: { state: 'approved', history: [{ state: 'approved', at: '2026-01-03T00:00:00.000Z' }] }, operations: [], operationCursor: -1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-03T00:00:00.000Z' };
        const entries = buildLibraryEntries({ media: [upload], artifacts: [document] });
        expect(entries).toHaveLength(2);
        expect(entries.find((entry) => entry.libraryKind === 'artifact').data).toBeNull();
        expect(entries.find((entry) => entry.libraryKind === 'artifact').deliveryState).toBe('approved');
    });
});