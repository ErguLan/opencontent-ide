/**
 * useWorkspaceBatch - batch variations of a prompt.
 *
 * Batch runs reuse the same step contract as a single run: `onSteps` receives an
 * array, a stopped batch leaves its steps `skipped` instead of `failed`, and a
 * batch that produced at least one version completes even if a later variation
 * fails, so partial results are never thrown away.
 */

import { useCallback } from 'react';
import { ALLOW_IMAGE_CONFIG_WITHOUT_AGENTIC, STORAGE_KEYS } from '../../../config/constants';
import { isAIConfigured } from '../../../services/ai';
import { AGENTIC_STEP_STATUS, executeAgenticBatch, looksLikeVisualRequest } from '../../../services/ai/agenticPipeline';
import { buildBrandContextText, getBrandKit, getBrandKitAssetIds } from '../../../services/brandKit';
import { getLocalSaveSettings } from '../../../services/filePersistence';
import { incrementUsage } from '../../../services/freemium';
import { saveLocalProject } from '../../../services/projectsLocal';
import { trackMetric } from '../../../services/metrics';
import { AGENT_STATES, BATCH_RUN_STATUS } from './useAgentRun';
import { PROJECT_STATUS } from './useWorkspaceProjects';
import { buildVersionSteps } from '../utils/agentSteps';
import { isAbortError } from '../utils/errorMessages';

const BATCH_PROGRESS_STEP_ID = 'batch-progress';
const MIN_BATCH_SIZE = 2;
const MAX_BATCH_SIZE = 10;

export function useWorkspaceBatch({
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
    onProjectIdChange,
    onProjectStatusChange,
    gateAction,
    onComplete,
    onUsageChanged
}) {
    const recordUsage = useCallback((action, amount = 1) => {
        incrementUsage(action, usageUserId, amount);
        onUsageChanged();
    }, [onUsageChanged, usageUserId]);

    const markNotConfigured = useCallback(() => {
        agentRun.setAgentState(AGENT_STATES.NOT_CONFIGURED);
        agentRun.notifyAIError('API_KEY_NOT_CONFIGURED', t('errors.apiKeyNotConfiguredTitle'));
    }, [agentRun, t]);

    const startBatch = useCallback(async (prompt, requestedCount) => {
        const batchPrompt = String(prompt || '').trim();
        const total = Math.min(Math.max(Number(requestedCount) || 0, MIN_BATCH_SIZE), MAX_BATCH_SIZE);
        if (!batchPrompt || !total || agentRun.isGenerating) return;
        if (!isAIConfigured()) {
            markNotConfigured();
            return;
        }
        if (!currentProjectId && !gateAction('project')) return;

        const brandKit = getBrandKit();
        const brandContext = buildBrandContextText(brandKit);
        const brandAssetIds = getBrandKitAssetIds(brandKit);
        const sourceImages = [
            media.attachedMedia?.data,
            ...media.mediaAssets
                .filter((asset) => media.activeAssetIds.includes(asset.id) || brandAssetIds.includes(asset.id))
                .map((asset) => asset.data)
        ].filter(Boolean).filter((value, index, values) => values.indexOf(value) === index);

        const controller = agentRun.createRunController();
        const settings = getLocalSaveSettings();
        let projectId = currentProjectId;
        let versionsSnapshot = Array.isArray(results.versions) ? [...results.versions] : [];
        let historySnapshot = Array.isArray(results.history) ? [...results.history] : [];
        let completedCount = 0;

        agentRun.beginRun({ isIteration: false });
        agentRun.setBatchProgress({ current: 0, total, status: BATCH_RUN_STATUS.WORKING });
        agentRun.setAgentState(AGENT_STATES.ANALYZING);
        onProjectStatusChange(PROJECT_STATUS.GENERATING);
        agentRun.trackRequest({ prompt: batchPrompt, isIteration: false, projectId, batchCount: total });

        const isVisualRequest = sourceImages.length > 0 || looksLikeVisualRequest(batchPrompt, false);

        try {
            if (!projectId) {
                const localProject = await saveLocalProject({
                    name: batchPrompt.substring(0, 50),
                    prompt: batchPrompt,
                    type: 'content',
                    status: PROJECT_STATUS.GENERATING,
                    errorMessage: '',
                    createdAt: new Date().toISOString()
                });
                projectId = localProject.id;
                onProjectIdChange(projectId);
                agentRun.trackRequest({ prompt: batchPrompt, isIteration: false, projectId, batchCount: total });
                await projects.loadProjects();
            }

            agentRun.setAgentState(AGENT_STATES.GENERATING);
            const batchResult = await executeAgenticBatch({
                count: total,
                prompt: batchPrompt,
                selectedTextModel: models.textModel,
                selectedImageModel: models.imageModel,
                visionModel: models.visionModel,
                imageConfig: (agenticMode || ALLOW_IMAGE_CONFIG_WITHOUT_AGENTIC) ? imageConfig : {},
                settings,
                sourceImages,
                projectId,
                projectName: results.currentPrompt || batchPrompt,
                version: versionsSnapshot.length + 1,
                preferNativeTools: localStorage.getItem(STORAGE_KEYS.TOOL_CALLING_ENABLED) !== 'false',
                preferOpenRouterImageTool: true,
                t,
                signal: controller.signal,
                brandContext,
                brandAssetIds,
                hasVisualReference: sourceImages.length > 0,
                promptForVariation: ({ current, total: variationTotal }) =>
                    `${batchPrompt}\n\n${t('workspace.batch.variationInstruction', { current, total: variationTotal })}`,
                onBeforeVariation: ({ current }) => {
                    if (controller.signal.aborted || !gateAction('generate')) return false;
                    if (isVisualRequest && !gateAction('image')) return false;
                    agentRun.setSteps((steps) => steps.map((step) => (step.id === BATCH_PROGRESS_STEP_ID
                        ? { ...step, text: t('workspace.batch.progress', { current, total }), status: AGENTIC_STEP_STATUS.WORKING }
                        : step)));
                    return true;
                },
                onProgress: ({ current, total: variationTotal }) => {
                    agentRun.setBatchProgress({
                        current,
                        total: variationTotal,
                        status: BATCH_RUN_STATUS.WORKING
                    });
                },
                onSteps: (steps, progress) => {
                    const current = progress?.current || completedCount + 1;
                    agentRun.setSteps([
                        {
                            id: BATCH_PROGRESS_STEP_ID,
                            text: t('workspace.batch.progress', { current, total }),
                            status: AGENTIC_STEP_STATUS.WORKING
                        },
                        ...(Array.isArray(steps) ? steps : [])
                    ]);
                },
                onChunk: agentRun.setDisplayedText,
                onVariationComplete: async (result, { current }) => {
                    if (controller.signal.aborted) throw new Error('REQUEST_ABORTED');
                    if (result.pendingSaves?.length) {
                        agentRun.setPendingArtifactSaves((requests) => {
                            const next = [...requests];
                            result.pendingSaves.forEach((request) => {
                                if (!next.some((item) => item.assetId === request.assetId)) next.push(request);
                            });
                            return next;
                        });
                    }
                    const cleanText = String(result.text || batchPrompt).trim();
                    const newVersion = {
                        type: 'agentic',
                        prompt: batchPrompt,
                        result: cleanText,
                        model: result.model || models.textModel,
                        imageUrl: result.imageUrl || null,
                        imageModel: result.imageModel || models.imageModel,
                        imagePrompt: result.imagePrompt || '',
                        imageAssetId: result.images?.at(-1)?.assetId || null,
                        imageRevisions: result.images || [],
                        timestamp: new Date().toISOString(),
                        isNew: true,
                        batchIndex: current,
                        batchTotal: total,
                        agenticSteps: result.plan,
                        agenticFailures: result.failures || [],
                        agenticPartial: Boolean(result.partial),
                        agenticRetryable: Boolean(result.retryable),
                        steps: buildVersionSteps(result.plan, `batch-${current}-step`)
                    };
                    versionsSnapshot = [...versionsSnapshot, newVersion];
                    historySnapshot = [
                        ...historySnapshot,
                        { role: 'user', content: batchPrompt },
                        { role: 'assistant', content: cleanText }
                    ];
                    completedCount = current;
                    const newVersionIndex = versionsSnapshot.length - 1;
                    results.setVersions(versionsSnapshot);
                    results.setCurrentVersionIndex(newVersionIndex);
                    results.setHistory(historySnapshot);
                    recordUsage('generate');
                    if (result.images?.length) recordUsage('image', result.images.length);
                    await saveLocalProject({
                        id: projectId,
                        status: PROJECT_STATUS.GENERATING,
                        errorMessage: '',
                        result: cleanText,
                        imageUrl: result.imageUrl || null,
                        prompt: results.currentPrompt || batchPrompt,
                        history: historySnapshot,
                        versions: versionsSnapshot,
                        currentVersionIndex: newVersionIndex
                    });
                }
            });

            const stopped = batchResult.stopped || controller.signal.aborted;
            agentRun.setBatchProgress({
                current: completedCount,
                total,
                status: stopped ? BATCH_RUN_STATUS.CANCELLED : BATCH_RUN_STATUS.COMPLETE
            });
            agentRun.setSteps((steps) => [
                ...steps
                    .filter((step) => step.id !== BATCH_PROGRESS_STEP_ID)
                    .map((step) => (step.status === AGENTIC_STEP_STATUS.WORKING
                        ? { ...step, status: AGENTIC_STEP_STATUS.SKIPPED }
                        : step)),
                {
                    id: 'batch-result',
                    text: stopped
                        ? t('workspace.batch.cancelled', { completed: completedCount, total })
                        : t('workspace.batch.completed', { count: completedCount }),
                    status: AGENTIC_STEP_STATUS.COMPLETED
                }
            ]);

            const hasBatchResults = versionsSnapshot.length > 0;
            agentRun.setAgentState(hasBatchResults ? AGENT_STATES.COMPLETE : AGENT_STATES.ERROR);
            onProjectStatusChange(hasBatchResults ? PROJECT_STATUS.COMPLETE : PROJECT_STATUS.ERROR);

            if (projectId) {
                const latest = versionsSnapshot.at(-1);
                await saveLocalProject({
                    id: projectId,
                    status: hasBatchResults ? PROJECT_STATUS.COMPLETE : PROJECT_STATUS.ERROR,
                    errorMessage: hasBatchResults ? '' : stopped ? t('errors.requestAborted') : '',
                    result: latest?.result || '',
                    imageUrl: latest?.imageUrl || null,
                    prompt: results.currentPrompt || batchPrompt,
                    history: historySnapshot,
                    versions: versionsSnapshot,
                    currentVersionIndex: versionsSnapshot.length - 1
                });
                await projects.loadProjects();
            }

            trackMetric('batch_complete', {
                projectId,
                requested: total,
                completed: completedCount,
                cancelled: stopped,
                model: models.textModel,
                visionModel: models.visionModel,
                imageModel: models.imageModel
            });
            onComplete?.({ completed: completedCount, total, cancelled: stopped });
        } catch (error) {
            const aborted = controller.signal.aborted || isAbortError(error);
            const normalized = aborted
                ? t('errors.requestAborted')
                : agentRun.notifyAIError(error.message || 'AI_REQUEST_FAILED');
            agentRun.setBatchProgress({
                current: completedCount,
                total,
                status: aborted ? BATCH_RUN_STATUS.CANCELLED : BATCH_RUN_STATUS.ERROR
            });
            agentRun.setSteps((steps) => [
                ...steps.map((step) => (step.status === AGENTIC_STEP_STATUS.WORKING
                    ? {
                        ...step,
                        status: aborted ? AGENTIC_STEP_STATUS.SKIPPED : AGENTIC_STEP_STATUS.FAILED,
                        ...(aborted ? {} : { text: normalized })
                    }
                    : step)),
                {
                    id: 'batch-error',
                    text: aborted
                        ? t('workspace.batch.cancelled', { completed: completedCount, total })
                        : normalized,
                    status: aborted ? AGENTIC_STEP_STATUS.SKIPPED : AGENTIC_STEP_STATUS.FAILED
                }
            ]);
            agentRun.setErrorMessage(normalized);
            const hasBatchResults = versionsSnapshot.length > 0;
            agentRun.setAgentState(hasBatchResults ? AGENT_STATES.COMPLETE : AGENT_STATES.ERROR);
            onProjectStatusChange(hasBatchResults ? PROJECT_STATUS.COMPLETE : PROJECT_STATUS.ERROR);
            if (projectId) {
                const latest = versionsSnapshot.at(-1);
                await saveLocalProject({
                    id: projectId,
                    status: hasBatchResults ? PROJECT_STATUS.COMPLETE : PROJECT_STATUS.ERROR,
                    errorMessage: hasBatchResults ? '' : normalized,
                    result: latest?.result || '',
                    imageUrl: latest?.imageUrl || null,
                    prompt: results.currentPrompt || batchPrompt,
                    history: historySnapshot,
                    versions: versionsSnapshot,
                    currentVersionIndex: versionsSnapshot.length - 1
                });
                await projects.loadProjects();
            }
            onComplete?.({ completed: completedCount, total, cancelled: aborted });
        } finally {
            agentRun.endRun();
        }
    }, [
        agentRun,
        agenticMode,
        currentProjectId,
        gateAction,
        imageConfig,
        markNotConfigured,
        media,
        models,
        onComplete,
        onProjectIdChange,
        onProjectStatusChange,
        projects,
        recordUsage,
        results,
        t
    ]);

    return { startBatch, markNotConfigured };
}