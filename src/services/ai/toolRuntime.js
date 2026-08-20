import { analyzeImage, generateImage } from './index';
import { getAllMedia, getMedia } from '../mediaService';
import { renameImageArtifact, saveImageArtifact } from '../imageArtifacts';
import { getLocalSaveSettings, persistImageArtifact, renderFilename, sanitizeFilename } from '../filePersistence';

const nowValues = () => {
    const now = new Date();
    return {
        date: now.toISOString().slice(0, 10),
        time: now.toISOString().slice(11, 19).replace(/:/g, '-'),
        timestamp: now.getTime()
    };
};

const getAssetMetadata = (asset) => ({
    assetId: asset.id,
    name: asset.name,
    type: asset.type,
    role: asset.role,
    kind: asset.kind,
    source: asset.source,
    model: asset.model,
    prompt: asset.prompt,
    tags: asset.tags || [],
    projectId: asset.projectId,
    version: asset.version,
    status: asset.status,
    location: asset.location,
    createdAt: asset.createdAt
});

const getCloneSettings = (settings, destination) => {
    if (destination === 'project') return { ...settings, mode: 'project' };
    if (destination === 'download') return { ...settings, mode: 'download' };
    return { ...settings, mode: 'configured-directory' };
};

export async function executeAgentTool(name, args = {}, context = {}) {
    const {
        selectedImageModel,
        visionModel,
        imageConfig = {},
        projectId = null,
        projectName = 'opencontent',
        version = 1,
        settings = getLocalSaveSettings(),
        signal,
        onArtifact,
        imageLimit = null
    } = context;
    const maxImages = imageLimit ?? (settings.allowMultipleImages === false
        ? 1
        : Math.max(1, Math.min(12, Number(settings.maxImagesPerTask) || 4)));
    const imageCount = Number(context.imageCount) || 0;

    if (name === 'list_gallery_assets') {
        const assets = await getAllMedia();
        const query = String(args.query || '').trim().toLowerCase();
        const kind = args.kind || 'all';
        const limit = Math.min(Math.max(Number(args.limit) || 50, 1), 100);
        const filtered = assets
            .filter((asset) => String(asset.type || '').startsWith('image/'))
            .filter((asset) => kind === 'all' || asset.kind === kind)
            .filter((asset) => {
                if (!query) return true;
                return [asset.name, asset.kind, asset.model, asset.prompt, ...(asset.tags || [])]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase()
                    .includes(query);
            })
            .sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')))
            .slice(0, limit);
        return {
            status: 'ok',
            gallery: 'application-indexeddb',
            total: filtered.length,
            assets: filtered.map(getAssetMetadata)
        };
    }

    if (name === 'get_gallery_asset') {
        const asset = await getMedia(args.assetId);
        if (!asset || !String(asset.type || '').startsWith('image/')) throw new Error('IMAGE_ARTIFACT_NOT_FOUND');
        return { status: 'ok', ...getAssetMetadata(asset), imageUrl: asset.data };
    }

    if (name === 'clone_gallery_asset') {
        const asset = await getMedia(args.assetId);
        if (!asset || !String(asset.type || '').startsWith('image/')) throw new Error('IMAGE_ARTIFACT_NOT_FOUND');
        const values = {
            project: projectName,
            projectId,
            version,
            kind: asset.kind || 'gallery-copy',
            model: asset.model,
            ...nowValues(),
            ext: 'png',
            type: asset.type
        };
        const filename = sanitizeFilename(args.filename || renderFilename(settings.filenameTemplate, values));
        const external = await persistImageArtifact(await (await fetch(asset.data)).blob(), {
            filename,
            metadata: { projectId, assetId: asset.id, model: asset.model, prompt: asset.prompt, cloneOf: asset.id },
            settings: getCloneSettings(settings, args.destination),
            approved: Boolean(args.approved || context.approved)
        });
        return {
            status: external.mode,
            sourceAssetId: asset.id,
            sourceRetainedInGallery: true,
            filename,
            external
        };
    }

    if (name === 'set_image_config' || name === 'set_image_configuration') {
        return { status: 'ok', imageConfig: { ...imageConfig, ...args } };
    }

    if (name === 'generate_image') {
        if (imageCount >= maxImages) throw new Error('IMAGE_TASK_LIMIT_REACHED');
        const referenceAssets = await Promise.all(
            (Array.isArray(args.sourceAssetIds) ? args.sourceAssetIds : [])
                .map((assetId) => getMedia(assetId))
        );
        const referenceImages = referenceAssets.filter(Boolean).map((asset) => asset.data);
        const result = await generateImage(args.prompt, args.model || selectedImageModel, {
            ...imageConfig,
            ...args,
            imageUrl: referenceImages[0] || args.imageUrl,
            imageUrls: referenceImages,
            signal
        });
        if (!result.success) throw new Error(result.error || 'IMAGE_GENERATION_FAILED');
        const artifact = await saveImageArtifact(result.imageUrl, {
            projectId,
            projectName,
            version,
            kind: 'generated',
            model: result.model || args.model || selectedImageModel,
            prompt: args.prompt,
            parameters: { ...imageConfig, ...args },
            referenceAssetIds: Array.isArray(args.sourceAssetIds) ? args.sourceAssetIds : [],
            settings,
            persistExternally: false
        });
        onArtifact?.(artifact.asset);
        return {
            status: 'ok',
            assetId: artifact.asset.id,
            imageUrl: artifact.asset.data,
            model: artifact.asset.model,
            filename: artifact.filename,
            external: artifact.external
        };
    }

    if (name === 'edit_image') {
        if (imageCount >= maxImages) throw new Error('IMAGE_TASK_LIMIT_REACHED');
        const source = await getMedia(args.assetId);
        if (!source) throw new Error('IMAGE_ARTIFACT_NOT_FOUND');
        const result = await generateImage(args.prompt, args.model || selectedImageModel, {
            ...imageConfig,
            imageUrl: source.data,
            imageUrls: [source.data],
            signal
        });
        if (!result.success) throw new Error(result.error || 'IMAGE_GENERATION_FAILED');
        const artifact = await saveImageArtifact(result.imageUrl, {
            projectId,
            projectName,
            version,
            kind: 'edited',
            model: result.model || selectedImageModel,
            prompt: args.prompt,
            parameters: imageConfig,
            parentAssetId: source.id,
            tags: ['edited'],
            settings
        });
        onArtifact?.(artifact.asset);
        return {
            status: 'ok',
            assetId: artifact.asset.id,
            imageUrl: artifact.asset.data,
            parentAssetId: source.id,
            model: artifact.asset.model,
            prompt: args.prompt
        };
    }

    if (name === 'analyze_image') {
        const asset = args.assetId ? await getMedia(args.assetId) : null;
        const imageUrl = args.imageUrl || asset?.data;
        if (!imageUrl) throw new Error('IMAGE_ARTIFACT_NOT_FOUND');
        const result = await analyzeImage(imageUrl, args.prompt, { signal, visionModel });
        if (!result.success) throw new Error(result.error || 'IMAGE_ANALYSIS_FAILED');
        return { status: 'ok', assetId: asset?.id || null, analysis: result.analysis, model: result.model };
    }

    if (name === 'save_image') {
        const asset = await getMedia(args.assetId);
        if (!asset) throw new Error('IMAGE_ARTIFACT_NOT_FOUND');
        const values = { project: projectName, projectId, version, kind: asset.kind || 'generated', model: asset.model, ...nowValues(), ext: 'png', type: asset.type };
        const filename = sanitizeFilename(args.filename || renderFilename(settings.filenameTemplate, values));
        const external = await persistImageArtifact(await (await fetch(asset.data)).blob(), {
            filename,
            metadata: { projectId, assetId: asset.id, model: asset.model, prompt: asset.prompt },
            settings,
            approved: Boolean(context.approved)
        });
        return { status: external.mode, assetId: asset.id, filename, external };
    }

    if (name === 'rename_artifact' || name === 'rename_image') {
        const updated = await renameImageArtifact(args.assetId, args.name);
        return { status: 'ok', assetId: updated.id, name: updated.name };
    }

    if (name === 'compare_images') {
        const assets = await Promise.all((Array.isArray(args.assetIds) ? args.assetIds : []).map((assetId) => getMedia(assetId)));
        if (assets.some((asset) => !asset) || assets.length < 2) throw new Error('IMAGE_ARTIFACT_NOT_FOUND');
        const analyses = [];
        for (const asset of assets) {
            const result = await analyzeImage(
                asset.data,
                args.prompt || 'Describe this image for comparison, focusing on composition, lighting, subject placement, and quality.',
                { signal, visionModel }
            );
            if (!result.success) throw new Error(result.error || 'IMAGE_ANALYSIS_FAILED');
            analyses.push({ assetId: asset.id, analysis: result.analysis });
        }
        return {
            status: 'ok',
            assetIds: assets.map((asset) => asset.id),
            comparison: analyses,
            analysis: analyses.map((item) => `${item.assetId}: ${item.analysis}`).join('\n\n')
        };
    }

    if (name === 'use_image_as_reference') {
        const asset = await getMedia(args.assetId);
        if (!asset) throw new Error('IMAGE_ARTIFACT_NOT_FOUND');
        return { status: 'ok', assetId: asset.id, referenceUrl: asset.data };
    }

    if (name === 'create_image_variation') {
        const source = await getMedia(args.assetId);
        if (!source) throw new Error('IMAGE_ARTIFACT_NOT_FOUND');
        if (imageCount >= maxImages) throw new Error('IMAGE_TASK_LIMIT_REACHED');
        const count = Math.min(Math.max(Number(args.count) || 1, 1), 4, maxImages - imageCount);
        const artifacts = [];
        for (let index = 0; index < count; index += 1) {
            const result = await generateImage(args.prompt, selectedImageModel, {
                ...imageConfig,
                signal,
                imageUrl: source.data,
                imageUrls: [source.data]
            });
            if (!result.success) throw new Error(result.error || 'IMAGE_GENERATION_FAILED');
            const artifact = await saveImageArtifact(result.imageUrl, {
                projectId,
                projectName,
                version,
                kind: 'edited',
                model: result.model || selectedImageModel,
                prompt: args.prompt,
                parameters: imageConfig,
                parentAssetId: source.id,
                tags: ['generated', 'variation'],
                settings
            });
            artifacts.push(artifact.asset);
            onArtifact?.(artifact.asset);
        }
        return {
            status: 'ok',
            sourceAssetId: source.id,
            assetIds: artifacts.map((asset) => asset.id),
            assetId: artifacts[0]?.id || null,
            imageUrl: artifacts[0]?.data || null,
            assets: artifacts
        };
    }

    throw new Error(`UNKNOWN_AGENT_TOOL:${name}`);
}
