/**
 * Library entries: one row per piece of content.
 *
 * A generated image is stored twice by design: the bytes live in the media store
 * and the artifact references them. That is one piece of content, not two, so
 * the Library shows it once.
 *
 * The rule, in one sentence: **a generated image is shown as its artifact; the
 * media asset it references is not a second card.** Uploaded assets (logos,
 * templates, references, overlays) stay media and are always shown. A generated
 * image whose artifact could not be created yet stays visible as media, and the
 * image backfill adopts it on the next load.
 */

import { DELIVERY_STATES, describePendingReview, resolveDeliveryState } from '../../services/delivery/deliveryState';
import { imageMediaAssetId, isImageArtifact } from '../../services/artifacts/imageArtifact';

function timestampOf(item) {
    return new Date(item.updatedAt || item.createdAt || 0).getTime() || 0;
}

export function buildLibraryEntries({ media = [], artifacts = [] } = {}) {
    const assetsById = new Map(media.map((asset) => [asset.id, asset]));
    const referencedAssetIds = new Set(
        artifacts.filter(isImageArtifact).map(imageMediaAssetId).filter(Boolean)
    );

    const mediaEntries = media
        .filter((asset) => !referencedAssetIds.has(asset.id))
        .map((asset) => ({
            ...asset,
            libraryKind: 'media',
            libraryType: asset.type?.startsWith('image/') ? 'image' : 'media',
            sortAt: timestampOf(asset),
            prompt: asset.prompt || null
        }));

    const artifactEntries = artifacts.map((artifact) => {
        const mediaAssetId = imageMediaAssetId(artifact);
        return {
            ...artifact,
            libraryKind: 'artifact',
            libraryType: artifact.type || 'artifact',
            sortAt: timestampOf(artifact),
            // An image artifact keeps its generation configuration in `content`,
            // because that is what the operation log replays.
            prompt: artifact.prompt || artifact.content?.prompt || null,
            model: artifact.model || artifact.content?.model || null,
            mediaAssetId: mediaAssetId || null,
            // Display only: a reference to bytes already loaded, never a copy.
            data: mediaAssetId ? (assetsById.get(mediaAssetId)?.data ?? null) : null
        };
    });

    return [...mediaEntries, ...artifactEntries]
        .map((item) => {
            const deliveryState = resolveDeliveryState(item.libraryKind === 'artifact' ? item.delivery?.state : item.status);
            const needsReview = deliveryState === DELIVERY_STATES.IN_REVIEW
                || (item.libraryKind === 'artifact' && describePendingReview(item));
            return { ...item, deliveryState, needsReview };
        })
        .sort((a, b) => b.sortAt - a.sortAt);
}