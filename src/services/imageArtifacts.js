import { getMedia, saveMedia, updateMediaMetadata } from './mediaService';
import { getLocalSaveSettings, persistImageArtifact, renderFilename } from './filePersistence';

const formatDate = (date = new Date()) => date.toISOString().slice(0, 10);
const formatTime = (date = new Date()) => date.toISOString().slice(11, 19).replace(/:/g, '-');

export async function saveImageArtifact(imageUrl, {
    projectId = null,
    versionId = null,
    projectName = 'opencontent',
    version = 1,
    kind = 'generated',
    model = null,
    prompt = '',
    parameters = {},
    status = 'completed',
    comments = [],
    referenceAssetIds = [],
    parentAssetId = null,
    tags = ['generated'],
    role = 'reference',
    settings = getLocalSaveSettings(),
    persistExternally = false,
    approved = false
} = {}) {
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error(`IMAGE_FETCH_HTTP_${response.status}`);
    const blob = await response.blob();
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

export async function renameImageArtifact(assetId, name) {
    const asset = await getMedia(assetId);
    if (!asset) throw new Error('IMAGE_ARTIFACT_NOT_FOUND');
    return updateMediaMetadata(assetId, { name });
}
