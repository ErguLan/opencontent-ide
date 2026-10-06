/**
 * Generated images and the artifacts that describe them.
 *
 * This module is the single funnel every generated image passes through: the
 * workspace, the agentic pipeline, the agent tools and the browser CLI all call
 * `saveImageArtifact`. It owns two things:
 *
 *   1. the bytes, stored once in the `user-assets` media store;
 *   2. the artifact, stored in `artifacts`, which REFERENCES those bytes and
 *      carries the generation configuration, the operation log and the delivery
 *      state.
 *
 * The split exists so a generated image is a first-class artifact: undoable,
 * versionable and reviewable, exactly like a document or a PDF, without ever
 * holding a second copy of the binary.
 */

import { getMedia, getAllMedia, saveMedia, updateMediaMetadata } from './mediaService';
import { applyArtifactOperation, listArtifacts, saveArtifact, withHistoryBase } from './artifacts/artifactEngine';
import {
    IMAGE_ERROR_CODES,
    ImageArtifactError,
    createImageArtifact,
    imageMediaAssetId,
    isImageArtifact,
    readImageConfig,
    setImageConfigOperation
} from './artifacts/imageArtifact';
import { getLocalSaveSettings, persistImageArtifact, renderFilename } from './filePersistence';
import { resolveDeliveryState, statusForNewItem } from './delivery/deliveryState';

const formatDate = (date = new Date()) => date.toISOString().slice(0, 10);
const formatTime = (date = new Date()) => date.toISOString().slice(11, 19).replace(/:/g, '-');
const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/**
 * Stores the bytes of a generated image and persists them through the local
 * save settings. Shared by the first save and by every regeneration, so a
 * revision is stored exactly like the original.
 */
async function storeImageBlob(blob, {
    projectId = null,
    versionId = null,
    projectName = 'opencontent',
    version = 1,
    kind = 'generated',
    model = null,
    prompt = '',
    parameters = {},
    status = statusForNewItem(),
    comments = [],
    referenceAssetIds = [],
    parentAssetId = null,
    tags = ['generated'],
    role = 'reference',
    settings = getLocalSaveSettings(),
    persistExternally = false,
    approved = false
} = {}) {
    const now = new Date();
    const filename = renderFilename(settings.filenameTemplate, {
        project: projectName,
        projectId: projectId || 'local',
        version,
        versionId: versionId || 'draft',
        kind,
        model: model || 'image-model',
        date: formatDate(now),
        time: formatTime(now),
        timestamp: now.getTime(),
        type: blob.type
    });
    const asset = await saveMedia(blob, filename, {
        role,
        tags,
        projectId,
        versionId,
        kind,
        source: kind === 'edited' ? 'agentic' : 'generated',
        model,
        prompt,
        parameters,
        version,
        status,
        comments,
        referenceAssetIds,
        parentAssetId
    });

    let external = { mode: 'project', filename };
    if (persistExternally || settings.autoSaveGeneratedImages) {
        external = await persistImageArtifact(blob, {
            filename,
            metadata: { projectId, versionId, assetId: asset.id, model, prompt },
            settings,
            approved
        });
    }

    const updatedAsset = await updateMediaMetadata(asset.id, {
        location: external.path || external.directory || external.mode,
        external
    });
    return { asset: updatedAsset || asset, external, filename };
}

async function fetchImageBlob(imageUrl) {
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error(`IMAGE_FETCH_HTTP_${response.status}`);
    return response.blob();
}

export async function saveImageArtifact(imageUrl, options = {}) {
    const blob = await fetchImageBlob(imageUrl);
    const stored = await storeImageBlob(blob, options);
    const artifact = await registerGeneratedImageArtifactSafe(stored.asset, options);
    return { ...stored, artifact };
}

/**
 * Creates and stores the artifact that describes a generated image.
 * The artifact references the asset; it never copies its bytes.
 */
export async function registerGeneratedImageArtifact(asset, {
    projectId = null,
    prompt = null,
    parameters = null,
    model = null,
    kind = null,
    source = 'generated',
    delivery = null
} = {}) {
    return saveArtifact(createImageArtifact({ asset, projectId, prompt, parameters, model, kind, source, delivery }));
}

/**
 * Registers the artifact of a freshly generated image without failing the run.
 *
 * The image is already stored when this is called, so losing the artifact must
 * not discard it. The failure is reported and the backfill below adopts the
 * asset later, which is why a missing artifact is recoverable rather than lost.
 */
async function registerGeneratedImageArtifactSafe(asset, options) {
    try {
        return await registerGeneratedImageArtifact(asset, options);
    } catch (error) {
        console.warn(`[images] The generated image ${asset?.id} was stored but its artifact could not be registered.`, error);
        return null;
    }
}

/**
 * Regenerates an image artifact: calls the provider, stores the new bytes as a
 * NEW media asset chained to the current one, and records the change as a
 * `set_image_config` operation on the artifact.
 *
 * The caller owns the model call. `generate` is injected on purpose: the service
 * stores and records, and it never chooses an image model on the user's behalf.
 *
 * The artifact is returned unsaved. `ArtifactStudio` snapshots and persists it
 * the same way it does for every other artifact edit.
 */
export async function regenerateImageArtifact(artifactInput, {
    prompt = null,
    parameters = null,
    model = null,
    generate,
    signal = null,
    version = 1,
    projectName = null,
    settings = getLocalSaveSettings(),
    persistExternally = false,
    approved = false
} = {}) {
    const config = readImageConfig(artifactInput);
    if (typeof generate !== 'function') {
        throw new ImageArtifactError(IMAGE_ERROR_CODES.GENERATOR_REQUIRED, 'Regenerating an image requires the caller to provide the image generator');
    }

    const nextPrompt = typeof prompt === 'string' && prompt.trim() ? prompt.trim() : config.prompt;
    if (!nextPrompt) {
        throw new ImageArtifactError(IMAGE_ERROR_CODES.PROMPT_REQUIRED, 'Regenerating an image requires a prompt', { mediaAssetId: config.mediaAssetId });
    }
    if (parameters !== null && !isPlainObject(parameters)) {
        throw new ImageArtifactError(IMAGE_ERROR_CODES.PARAMETERS_INVALID, 'Image parameters must be an object', { mediaAssetId: config.mediaAssetId });
    }
    const nextParameters = parameters === null ? config.parameters : parameters;

    const result = await generate({ prompt: nextPrompt, parameters: nextParameters, model: model || config.model, signal });
    if (!result?.success || !result.imageUrl) {
        throw new ImageArtifactError(IMAGE_ERROR_CODES.GENERATION_FAILED, result?.error || 'The image provider did not return an image', { mediaAssetId: config.mediaAssetId });
    }

    const blob = await fetchImageBlob(result.imageUrl);
    const stored = await storeImageBlob(blob, {
        projectId: artifactInput.projectId,
        projectName: projectName || artifactInput.name,
        version,
        kind: 'generated',
        model: result.model || model || config.model,
        prompt: nextPrompt,
        parameters: nextParameters,
        parentAssetId: config.mediaAssetId,
        settings,
        persistExternally,
        approved
    });

    const artifact = applyArtifactOperation(withHistoryBase(artifactInput), setImageConfigOperation({
        mediaAssetId: stored.asset.id,
        prompt: nextPrompt,
        parameters: nextParameters,
        model: result.model || model || config.model
    }));

    return { ...stored, artifact, previousAssetId: config.mediaAssetId };
}

export async function renameImageArtifact(assetId, name) {
    const asset = await getMedia(assetId);
    if (!asset) throw new Error('IMAGE_ARTIFACT_NOT_FOUND');
    return updateMediaMetadata(assetId, { name });
}

/** Generated images that were stored before image artifacts existed. */
function isGeneratedImageAsset(asset) {
    if (!asset?.id || typeof asset.type !== 'string' || !asset.type.startsWith('image/')) return false;
    if (asset.kind === 'generated' || asset.kind === 'edited') return true;
    return asset.source === 'generated' || asset.source === 'agentic';
}

/**
 * One backfill pass. Exported un-memoized so its idempotency can be tested and
 * so a caller that genuinely needs a fresh read can ask for one.
 */
export async function runGeneratedImageBackfill() {
    const report = { status: 'loaded', created: 0, skipped: 0, failed: 0, errors: [], media: [], artifacts: [] };

    let media = [];
    let artifacts = [];
    try {
        [media, artifacts] = await Promise.all([getAllMedia(), listArtifacts()]);
    } catch (error) {
        report.status = 'unavailable';
        report.errors.push({ scope: 'read', message: error?.message || String(error) });
        console.warn('[images] Generated images could not be inspected for a missing artifact.', error);
        return report;
    }

    const referenced = new Set(
        artifacts.filter(isImageArtifact).map(imageMediaAssetId).filter(Boolean)
    );
    const orphans = media.filter((asset) => isGeneratedImageAsset(asset) && !referenced.has(asset.id));

    for (const asset of orphans) {
        const deliveryState = resolveDeliveryState(asset.status);
        try {
            const created = await registerGeneratedImageArtifact(asset, {
                projectId: asset.projectId,
                prompt: asset.prompt,
                parameters: asset.parameters,
                model: asset.model,
                kind: asset.kind,
                source: asset.source,
                delivery: { state: deliveryState, history: [{ state: deliveryState, at: asset.updatedAt || asset.createdAt }] }
            });
            artifacts.push(created);
            report.created += 1;
        } catch (error) {
            report.failed += 1;
            report.errors.push({ assetId: asset.id, message: error?.message || String(error) });
        }
    }

    report.skipped = media.length - orphans.length;
    report.media = media;
    report.artifacts = artifacts;

    if (report.created > 0 || report.failed > 0) {
        console.warn(`[images] Backfilled ${report.created} generated image artifact(s); ${report.failed} failed.`, report.errors);
    }

    return report;
}

let backfillPromise = null;

/**
 * Gives every generated image that predates image artifacts an artifact.
 *
 * Nothing is deleted and no media is rewritten: an artifact is added next to the
 * asset it references, keeping the delivery state the asset already had. The run
 * is idempotent and returns the snapshot it read, so a view can reuse it instead
 * of querying the stores again.
 *
 * A run that could not read the stores is not memoized, so the next caller
 * retries instead of inheriting a failure.
 */
export function ensureGeneratedImagesHaveArtifacts() {
    if (backfillPromise) return backfillPromise;

    const run = runGeneratedImageBackfill().then((report) => {
        if (report.status !== 'loaded' && backfillPromise === run) backfillPromise = null;
        return report;
    });

    backfillPromise = run;
    return run;
}

/** Forgets the memoized backfill. Used by tests and after a forced re-read. */
export function resetImageBackfillState() {
    backfillPromise = null;
}