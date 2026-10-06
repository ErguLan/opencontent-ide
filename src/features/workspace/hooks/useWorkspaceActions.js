/**
 * useWorkspaceActions - user actions that operate on an existing result.
 *
 * Export, publish, download, manual save, image generation for a version, and
 * approval of pending artifact writes. None of these start an agent run, so they
 * live apart from the generation flow.
 *
 * Two of them are worth reading carefully.
 *
 * `handlePublishProject` is not a queue. Publishing moves the delivery state of
 * the piece through the state machine, as an ordinary artifact operation, so it
 * is versioned and undoable like any other edit.
 *
 * `handleOpenInIde` never claims the desktop application opened anything,
 * because a web page cannot know that. It exports the document first, asks the
 * user for the folder path the browser cannot read, and hands over a link the
 * user activates.
 */

import { useCallback, useState } from 'react';
import { ALLOW_IMAGE_CONFIG_WITHOUT_AGENTIC, getExternalIdeIntegration } from '../../../config/constants';
import { generateImage } from '../../../services/ai';
import { executeAgentTool } from '../../../services/ai/toolRuntime';
import { saveImageArtifact } from '../../../services/imageArtifacts';
import {
    getExtensionFromMime,
    getLocalSaveSettings,
    persistImageArtifact,
    sanitizeFilename
} from '../../../services/filePersistence';
import { isOpenInIdeConfigured } from '../../../services/integration/openInIde';
import { incrementUsage } from '../../../services/freemium';
import { saveLocalProject } from '../../../services/projectsLocal';
import { trackMetric } from '../../../services/metrics';
import {
    OPERATION_TYPES,
    applyArtifactOperation,
    listArtifacts,
    saveArtifact,
    snapshotArtifact
} from '../../../services/artifacts/artifactEngine';
import { DELIVERY_STATES, nextStates, resolveDeliveryState } from '../../../services/delivery/deliveryState';
import { downloadImageFromUrl, downloadJsonFile } from '../utils/promptHelpers';
import { PROJECT_STATUS } from './useWorkspaceProjects';

const CLOSED_OPEN_IN_IDE = Object.freeze({ open: false });

/** Persistence outcomes that mean "nothing left the browser". */
const EXPORT_BLOCKED_MODES = Object.freeze({
    project: 'projectOnly',
    'approval-required': 'approvalRequired',
    'local-writes-blocked': 'localWritesBlocked'
});

const EXPORT_FILENAME_MAX = 48;
const TEXT_MIME = 'text/markdown;charset=utf-8';

/**
 * The document as bytes, fetched at most once.
 *
 * An image version is read from its URL and a text version is wrapped, so the
 * export writes the same content the workspace is showing.
 */
async function versionToBlob(version) {
    if (version.imageUrl) {
        const response = await fetch(version.imageUrl);
        if (!response.ok) throw new Error(`IMAGE_FETCH_HTTP_${response.status}`);
        return response.blob();
    }
    const text = String(version.result || '').trim();
    if (!text) return null;
    return new Blob([text], { type: TEXT_MIME });
}

function resolveExtension(blob) {
    if (String(blob.type || '').startsWith('text/')) return 'md';
    return getExtensionFromMime(blob.type || 'image/png');
}

function exportBaseName(version, fallback) {
    const firstLine = String(version.prompt || '').split('\n')[0].trim();
    return sanitizeFilename(firstLine.slice(0, EXPORT_FILENAME_MAX), fallback);
}

/** Where the export ended up, in words. The browser knows less than it looks. */
function describeExportLocation(outcome, filename, t) {
    switch (outcome.mode) {
        case 'configured-directory':
            return t('workspace.openInIde.exportedToDirectory', { filename, directory: outcome.directory || '' });
        case 'local-server':
            return t('workspace.openInIde.exportedToServer', { filename, path: outcome.path || '' });
        case 'overwrite-blocked':
            return t('workspace.openInIde.exportedExisting', { filename, directory: outcome.directory || '' });
        case 'browser-download':
            return t('workspace.openInIde.exportedToDownloads', { filename });
        default:
            return t('workspace.openInIde.exportedTo', { filename, location: outcome.mode });
    }
}

export function useWorkspaceActions({
    t,
    usageUserId,
    agentRun,
    results,
    projects,
    media,
    models,
    imageConfig,
    agenticMode,
    currentProjectId,
    onRefreshUsage,
    gateAction
}) {
    const [isGeneratingImage, setIsGeneratingImage] = useState(false);
    const [openInIde, setOpenInIde] = useState(CLOSED_OPEN_IN_IDE);

    const handleDownloadImage = useCallback(async (url) => {
        await downloadImageFromUrl(url);
    }, []);

    const handleExportProject = useCallback(() => {
        if (results.versions.length === 0) return;
        if (!gateAction('export')) return;

        const safeIndex = results.getSafeIndex(results.currentVersionIndex);
        const current = safeIndex >= 0 ? results.versions[safeIndex] : null;
        const payload = {
            app: 'OpenContent IDE',
            exportedAt: new Date().toISOString(),
            projectId: currentProjectId,
            prompt: current?.prompt || results.currentPrompt,
            content: current?.result || '',
            imageUrl: current?.imageUrl || null,
            versions: results.versions,
            history: results.history
        };

        downloadJsonFile(payload, `opencontent-export-${Date.now()}.json`);
        incrementUsage('export', usageUserId);
        onRefreshUsage();
        trackMetric('export_success', { projectId: currentProjectId });
    }, [currentProjectId, gateAction, onRefreshUsage, results, usageUserId]);

    /**
     * Publishing is a delivery transition, not a queue entry.
     *
     * The piece is the artifact of the current project; without one there is
     * nothing to publish and this says so instead of inventing a record. The
     * move goes through the state machine as a `set_delivery_state` operation
     * and is snapshotted, so it is versioned and undoable exactly like an edit.
     */
    const handlePublishProject = useCallback(async () => {
        if (results.versions.length === 0) return;
        if (!gateAction('publish')) return;

        if (!currentProjectId) {
            agentRun.openInfoNotice(t('workspace.publish.needsProjectTitle'), t('workspace.publish.needsProjectMessage'));
            return;
        }

        let piece = null;
        try {
            const artifacts = await listArtifacts({ projectId: currentProjectId });
            piece = artifacts[0] || null;
        } catch (error) {
            agentRun.openInfoNotice(
                t('workspace.publish.failedTitle'),
                t('workspace.publish.failedMessage', { code: error?.message || 'DELIVERY_READ_FAILED' })
            );
            return;
        }

        if (!piece) {
            agentRun.openInfoNotice(t('workspace.publish.noArtifactTitle'), t('workspace.publish.noArtifactMessage'));
            return;
        }

        const state = resolveDeliveryState(piece.delivery?.state);
        if (state === DELIVERY_STATES.PUBLISHED) {
            agentRun.openInfoNotice(t('workspace.publish.alreadyPublishedTitle'), t('workspace.publish.alreadyPublishedMessage'));
            return;
        }

        // The machine decides what comes next; the interface only reports it.
        const [next] = nextStates(state);
        if (next !== DELIVERY_STATES.PUBLISHED) {
            agentRun.openInfoNotice(
                t('workspace.publish.notApprovedTitle'),
                t('workspace.publish.notApprovedMessage', {
                    state: t(`delivery.states.${state}`),
                    next,
                    nextLabel: t(`delivery.states.${next}`)
                })
            );
            return;
        }

        try {
            const moved = applyArtifactOperation(piece, {
                type: OPERATION_TYPES.SET_DELIVERY_STATE,
                state: DELIVERY_STATES.PUBLISHED
            });
            const label = t('delivery.versionLabel', { state: t(`delivery.states.${DELIVERY_STATES.PUBLISHED}`) });
            await saveArtifact(snapshotArtifact(moved, label));
        } catch (error) {
            agentRun.openInfoNotice(
                t('workspace.publish.failedTitle'),
                t('workspace.publish.failedMessage', { code: error?.code || 'DELIVERY_UNKNOWN_ERROR' })
            );
            return;
        }

        incrementUsage('publish', usageUserId);
        onRefreshUsage();
        trackMetric('publish_delivered', { projectId: currentProjectId, artifactId: piece.id });
        agentRun.openInfoNotice(t('workspace.publish.publishedTitle'), t('workspace.publish.publishedMessage'));
    }, [agentRun, currentProjectId, gateAction, onRefreshUsage, results, t, usageUserId]);

    /**
     * Opens the current version in an external desktop editor.
     *
     * The order is deliberate. A document that only exists in this browser cannot
     * be opened by another application, so it is exported first. Only when a file
     * really reached disk is a link offered, and the link carries no path the
     * browser had to invent.
     */
    const handleOpenInIde = useCallback(async () => {
        if (results.versions.length === 0) return;

        if (!isOpenInIdeConfigured(getExternalIdeIntegration())) {
            agentRun.openInfoNotice(t('workspace.openInIde.notConfiguredTitle'), t('workspace.openInIde.notConfiguredMessage'));
            return;
        }

        const safeIndex = results.getSafeIndex(results.currentVersionIndex);
        const current = safeIndex >= 0 ? results.versions[safeIndex] : null;
        if (!current) return;

        setOpenInIde({ open: true, status: 'exporting', filename: '', location: '' });

        let filename = '';
        try {
            const blob = await versionToBlob(current);
            if (!blob) {
                setOpenInIde({ open: true, status: 'blocked', filename: '', location: '', blockKey: 'noContent', code: 'NO_CONTENT' });
                return;
            }

            filename = `${exportBaseName(current, 'opencontent-document')}.${resolveExtension(blob)}`;
            const settings = getLocalSaveSettings();
            const outcome = await persistImageArtifact(blob, { filename, settings, approved: true });

            const written = outcome.filename || filename;
            const blockKey = EXPORT_BLOCKED_MODES[outcome.mode];
            if (blockKey) {
                trackMetric('open_in_ide_export_blocked', { projectId: currentProjectId, mode: outcome.mode });
                setOpenInIde({ open: true, status: 'blocked', filename: written, location: '', blockKey, code: outcome.mode });
                return;
            }

            trackMetric('open_in_ide_export_ready', { projectId: currentProjectId, mode: outcome.mode });
            setOpenInIde({
                open: true,
                status: 'ready',
                filename: written,
                location: describeExportLocation(outcome, written, t),
                code: outcome.mode
            });
        } catch (error) {
            setOpenInIde({ open: true, status: 'failed', filename, location: '', code: error?.message || 'EXPORT_FAILED' });
        }
    }, [agentRun, currentProjectId, results, t]);

    const closeOpenInIde = useCallback(() => setOpenInIde(CLOSED_OPEN_IN_IDE), []);

    const handleSaveCurrentProject = useCallback(async () => {
        if (!currentProjectId || results.versions.length === 0) return;

        const safeIndex = results.getSafeIndex(results.currentVersionIndex);
        const current = safeIndex >= 0 ? results.versions[safeIndex] : null;
        await saveLocalProject({
            id: currentProjectId,
            status: PROJECT_STATUS.COMPLETE,
            prompt: results.currentPrompt || current?.prompt || '',
            result: current?.result || '',
            imageUrl: current?.imageUrl || null,
            history: results.history,
            versions: results.versions,
            currentVersionIndex: safeIndex
        });

        trackMetric('project_saved_manual', { projectId: currentProjectId });
        await projects.loadProjects();
    }, [currentProjectId, projects, results]);

    const handleGenerateImage = useCallback(async () => {
        if (isGeneratingImage || results.versions.length === 0) return;
        if (!gateAction('image')) return;

        const safeIndex = results.getSafeIndex(results.currentVersionIndex);
        const currentVersion = safeIndex >= 0 ? results.versions[safeIndex] : null;
        if (!currentVersion || currentVersion.imageUrl) return;

        setIsGeneratingImage(true);
        try {
            const imagePrompt = `${t('workspace.imageForVersionPrompt')}${currentVersion.prompt || currentVersion.result?.substring(0, 200)}`;
            const imageResponse = await generateImage(imagePrompt, models.imageModel, {
                ...((agenticMode || ALLOW_IMAGE_CONFIG_WITHOUT_AGENTIC) ? imageConfig : {})
            });

            if (!imageResponse.success) {
                agentRun.notifyAIError(imageResponse.error || 'IMAGE_GENERATION_FAILED', t('errors.imageToolError'));
                return;
            }

            const generatedArtifact = await saveImageArtifact(imageResponse.imageUrl, {
                projectId: currentProjectId,
                projectName: results.currentPrompt,
                version: safeIndex + 1,
                kind: 'generated',
                model: imageResponse.model || models.imageModel,
                prompt: imagePrompt
            });
            const updatedVersions = results.versions.map((version, index) => (index === safeIndex
                ? {
                    ...version,
                    imageUrl: generatedArtifact.asset.data,
                    imageModel: imageResponse.model || models.imageModel,
                    imagePrompt,
                    imageAssetId: generatedArtifact.asset.id,
                    imageRevisions: [...(version.imageRevisions || []), generatedArtifact.asset]
                }
                : version));
            results.setVersions(updatedVersions);
            incrementUsage('image', usageUserId);
            onRefreshUsage();
            trackMetric('image_generation_success', {
                projectId: currentProjectId,
                model: imageResponse.model,
                type: 'edit'
            });

            if (currentProjectId) {
                await saveLocalProject({
                    id: currentProjectId,
                    versions: updatedVersions,
                    currentVersionIndex: safeIndex,
                    history: results.history,
                    prompt: results.currentPrompt,
                    result: updatedVersions[safeIndex]?.result || '',
                    imageUrl: updatedVersions[safeIndex]?.imageUrl || null
                });
            }
        } catch (error) {
            agentRun.notifyAIError(error.message || 'IMAGE_GENERATION_FAILED', t('errors.imageToolError'));
        } finally {
            setIsGeneratingImage(false);
        }
    }, [
        agentRun,
        agenticMode,
        currentProjectId,
        gateAction,
        imageConfig,
        isGeneratingImage,
        models,
        onRefreshUsage,
        results,
        t,
        usageUserId
    ]);

    const handleApproveArtifactSave = useCallback(async (request) => {
        if (!request?.assetId || agentRun.isGenerating) return;
        try {
            const result = await executeAgentTool('save_image', {
                assetId: request.assetId,
                filename: request.filename
            }, {
                selectedImageModel: models.imageModel,
                projectId: currentProjectId,
                projectName: results.currentPrompt,
                version: results.versions.length + 1,
                settings: getLocalSaveSettings(),
                approved: true
            });
            if (result.status === 'approval-required' || result.status === 'local-writes-blocked') {
                agentRun.notifyAIError(result.status, t('errors.imageToolError'));
                return;
            }
            agentRun.setPendingArtifactSaves((requests) =>
                requests.filter((item) => item.assetId !== request.assetId));
        } catch (error) {
            agentRun.notifyAIError(error.message || 'IMAGE_SAVE_FAILED', t('errors.imageToolError'));
        }
    }, [agentRun, currentProjectId, models, results, t]);

    const dismissArtifactSave = useCallback((assetId) => {
        agentRun.setPendingArtifactSaves((requests) => requests.filter((item) => item.assetId !== assetId));
    }, [agentRun]);

    const handleUseArtifactAsReference = useCallback((artifact) => {
        const source = artifact?.data || artifact?.thumbnailUrl || artifact?.imageUrl;
        if (!source) return;
        media.attachExistingAsset({
            id: artifact.id || artifact.assetId,
            name: artifact.name || t('workspace.artifacts.untitled'),
            data: source,
            role: 'reference'
        });
    }, [media, t]);

    return {
        isGeneratingImage,
        openInIde,
        handleDownloadImage,
        handleExportProject,
        handlePublishProject,
        handleOpenInIde,
        closeOpenInIde,
        handleSaveCurrentProject,
        handleGenerateImage,
        handleApproveArtifactSave,
        dismissArtifactSave,
        handleUseArtifactAsReference
    };
}