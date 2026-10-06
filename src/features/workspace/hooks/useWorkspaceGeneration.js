/**
 * useWorkspaceGeneration - the single-request generation flow.
 *
 * Owns prompt assembly, the agentic and direct branches, the run lifecycle and
 * the persistence of each produced version. The step log always follows the
 * agentic step contract: `onSteps` receives an array in the tool strategy and
 * an updater in the plan strategy, and no step is left in `working` once the
 * run ends.
 *
 * A partial run is a success with failures attached: the produced text and
 * images are kept, the failures are stored on the version so the UI can offer a
 * retry, and the run still completes.
 */

import { useCallback } from 'react';
import { ALLOW_IMAGE_CONFIG_WITHOUT_AGENTIC, STORAGE_KEYS } from '../../../config/constants';
import {
    analyzeImage,
    generateImage,
isAIConfigured,
    isImageGenerationConfigured,
    sendToAI,
    supportsVisualInputModel
} from '../../../services/ai';
import { executeAgenticPipeline, looksLikeVisualRequest } from '../../../services/ai/agenticPipeline';
import { saveImageArtifact } from '../../../services/imageArtifacts';
import { buildBrandContextText, getBrandKit, getBrandKitAssetIds } from '../../../services/brandKit';
import { saveLocalProject } from '../../../services/projectsLocal';
import { incrementUsage } from '../../../services/freemium';
import { trackMetric } from '../../../services/metrics';
import { applyLogoOverlay } from '../../../utils/imageProcessor';
import { AGENT_STATES } from './useAgentRun';
import { PROJECT_STATUS } from './useWorkspaceProjects';
import { buildVersionSteps, createStep, replaceStep, settleSteps, AGENTIC_STEP_STATUS } from '../utils/agentSteps';
import { isAbortError } from '../utils/errorMessages';
import {
    buildHistoryContext,
    getScopedHistory,
    isCasualChatPrompt,
    isImageEditRequest,
    shouldAllowAutoImage
} from '../utils/promptHelpers';
import {
    buildMasterSystemPrompt,
    buildTaskModeInstruction,
    CONVERSATIONAL_SYSTEM_PROMPT,
    getBrandAssetContext
} from '../utils/promptTemplates';

const IMAGE_TAG_REGEX = /\[GENERATE_IMAGE:\s*([\s\S]*?)\]/i;
const OVERLAY_TAG_REGEX = /\[LOGO_OVERLAY:\s*(.*?),\s*(.*?),\s*(.*?)\]/i;

const preferNativeTools = () => localStorage.getItem(STORAGE_KEYS.TOOL_CALLING_ENABLED) !== 'false';

export function useWorkspaceGeneration({
    t,
    usageUserId,
    agentRun,
    results,
    projects,
    media,
    models,
    imageConfig,
    agenticMode,
    imageProcessingMode,
    creativeTaskMode,
    currentProjectId,
    onProjectIdChange,
    onProjectStatusChange,
    onUsageChanged,
    gateAction
}) {
const recordUsage = useCallback((action, amount = 1) => {
        incrementUsage(action, usageUserId, amount);
        onUsageChanged();
    }, [onUsageChanged, usageUserId]);

    const readBrandContext = useCallback(() => {
        const brandKit = getBrandKit();
        return {
            brandKit,
            context: buildBrandContextText(brandKit),
            assetIds: getBrandKitAssetIds(brandKit)
        };
    }, []);

    const collectGenerationAssets = useCallback(() => {
        const { brandKit, assetIds } = readBrandContext();
        const activeAssets = media.mediaAssets.filter((asset) => media.activeAssetIds.includes(asset.id));
        const configuredBrandAssets = media.mediaAssets.filter((asset) => assetIds.includes(asset.id));
        const generationAssets = [...activeAssets, ...configuredBrandAssets]
            .filter((asset, index, assets) => assets.findIndex((item) => item.id === asset.id) === index);
        return {
            generationAssets,
            activeLogos: generationAssets.filter(
                (asset) => asset.role === 'logo' || brandKit.logoAssetIds.includes(asset.id)
            ),
            templateAssets: activeAssets.filter((asset) => asset.role === 'template')
        };
    }, [media, readBrandContext]);

const markNotConfigured = useCallback(() => {
        agentRun.setAgentState(AGENT_STATES.NOT_CONFIGURED);
        agentRun.notifyAIError('API_KEY_NOT_CONFIGURED', t('errors.apiKeyNotConfiguredTitle'));
    }, [agentRun, t]);

    const markImageModelMissing = useCallback(() => {
        agentRun.setAgentState(AGENT_STATES.IMAGE_MODEL_MISSING);
        agentRun.setErrorMessage(t('workspace.imageModelMissingMessage'));
    }, [agentRun, t]);

    const persistRunError = useCallback(async ({ projectId, normalizedPrompt, normalized }) => {
        if (!projectId) return;
        try {
            await saveLocalProject({
                id: projectId,
                status: PROJECT_STATUS.ERROR,
                errorMessage: normalized,
                prompt: normalizedPrompt,
                lastAttemptAt: new Date().toISOString()
            });
            await projects.loadProjects();
        } catch (persistError) {
            console.error('Failed to persist generation error', persistError);
        }
    }, [projects]);

    const persistOutcome = useCallback(async (payload) => {
        const { projectId, status, errorMessage = '', isIteration, ...rest } = payload;
        if (!projectId) return;
        await saveLocalProject({ id: projectId, status, errorMessage, ...rest });
        onProjectStatusChange(status);
        if (isIteration) results.setCurrentPrompt(rest.prompt);
        await projects.loadProjects();
    }, [onProjectStatusChange, projects, results]);

    const runDirectImageEdit = useCallback(async ({
        prompt,
        projectId,
        isIteration,
        imageUrls,
        activeLogos,
        baseVersionPrompt,
        scopedHistory,
        currentVersions
    }) => {
        const { context: brandContext } = readBrandContext();
        const signal = agentRun.getRunSignal();

        agentRun.setSteps([
            createStep(1, t('Agent.analyzing'), AGENTIC_STEP_STATUS.COMPLETED),
            createStep(2, t('workspace.stepDetectedEdit'), AGENTIC_STEP_STATUS.COMPLETED),
            createStep(3, t('workspace.generatingEditedVisual'), AGENTIC_STEP_STATUS.WORKING)
        ]);
        agentRun.setAgentState(AGENT_STATES.GENERATING);

        const logoLine = activeLogos.length > 0
            ? `\nIncorporate these brand logos naturally: ${activeLogos.map((asset) => asset.name).join(', ')}.`
            : '';
        const smartImagePrompt = `Edit this template with premium quality and preserve brand consistency.\nUser request: ${prompt}${logoLine}\n${brandContext}\nAdd realistic lighting/effects only if requested.`;
        const directImage = await generateImage(smartImagePrompt, models.imageModel, {
            signal,
            imageUrl: imageUrls[0] || null,
            imageUrls,
            ...imageConfig
        });

        if (!directImage?.success) {
            console.warn('Smart direct image generation failed, falling back to text+image flow.');
            return null;
        }

        const directArtifact = await saveImageArtifact(directImage.imageUrl, {
            projectId,
            projectName: prompt,
            version: currentVersions.length + 1,
            kind: 'edited',
            model: directImage.model || models.imageModel,
            prompt: smartImagePrompt
        });

        const cleanText = t('workspace.visualEditApplied');
        const newUserMessage = { role: 'user', content: prompt };
        const textAssistantMessage = { role: 'assistant', content: cleanText };
        const nextHistory = isIteration
            ? [...scopedHistory, newUserMessage, textAssistantMessage]
            : [newUserMessage, textAssistantMessage];
        results.setHistory(nextHistory);

        const newVersion = {
            type: 'text',
            prompt,
            result: cleanText,
            model: directImage.model || `visual:${models.imageModel}`,
            imageUrl: directImage.imageUrl,
            imageModel: directImage.model || models.imageModel,
            imagePrompt: smartImagePrompt,
            imageAssetId: directArtifact.asset.id,
            imageRevisions: [directArtifact.asset],
            timestamp: new Date().toISOString(),
            isNew: true,
            steps: [
                createStep(1, t('workspace.stepDetectedEdit'), AGENTIC_STEP_STATUS.COMPLETED),
                createStep(2, t('workspace.stepGeneratedVisual'), AGENTIC_STEP_STATUS.COMPLETED)
            ]
        };

        const versionsSnapshot = [...currentVersions, newVersion];
        const newVersionIndex = versionsSnapshot.length - 1;
        results.setVersions(versionsSnapshot);
        results.setCurrentVersionIndex(newVersionIndex);
        agentRun.setSteps((steps) => settleSteps(steps));
        agentRun.setAgentState(AGENT_STATES.COMPLETE);

        recordUsage('generate');
        recordUsage('image');
        if (isIteration) recordUsage('iteration');
        trackMetric('smart_direct_image_edit_success', {
            projectId,
            imageModel: directImage.model || models.imageModel
        });

        return {
            cleanText,
            imageUrl: directImage.imageUrl,
            nextHistory,
            versionsSnapshot,
            newVersionIndex,
            nextPromptValue: isIteration ? `${baseVersionPrompt}\n> ${prompt}` : prompt
        };
    }, [agentRun, imageConfig, models, readBrandContext, recordUsage, results, t]);

const generateRequestedVisual = useCallback(async ({
        requestedImagePrompt,
        projectId,
        prompt,
        brandContext,
        imageUrls,
        activeLogos,
        overlayMatch,
        newVersionIndex
    }) => {
        const imagePrompt = brandContext
            ? `${brandContext}\n\nVISUAL TASK:\n${requestedImagePrompt}`
            : requestedImagePrompt;
        const visualStepId = `img-${Date.now()}`;

        agentRun.setSteps((steps) => [
            ...settleSteps(steps),
            createStep(visualStepId, t('workspace.generatingRequestedVisual'), AGENTIC_STEP_STATUS.WORKING)
        ]);

        const imageResponse = await generateImage(imagePrompt, models.imageModel, {
            signal: agentRun.getRunSignal(),
            imageUrl: imageUrls[0] || null,
            imageUrls,
            ...((agenticMode || ALLOW_IMAGE_CONFIG_WITHOUT_AGENTIC) ? imageConfig : {})
        });

        if (!imageResponse.success) {
            const message = agentRun.notifyAIError(
                imageResponse.error || 'IMAGE_GENERATION_FAILED',
                t('errors.imageToolError')
            );
            agentRun.setSteps((steps) => replaceStep(steps, visualStepId, {
                status: AGENTIC_STEP_STATUS.FAILED,
                text: message
            }));
            return {
                imageUrl: null,
                failures: [{
                    stepId: visualStepId,
                    name: 'generate_image',
                    code: 'IMAGE_GENERATION_FAILED',
                    message,
                    retryable: true
                }]
            };
        }

        const generatedArtifact = await saveImageArtifact(imageResponse.imageUrl, {
            projectId,
            projectName: prompt,
            version: results.versions.length + 1,
            kind: 'generated',
            model: imageResponse.model || models.imageModel,
            prompt: imagePrompt
        });

        let finalImageUrl = imageResponse.imageUrl;

        if (overlayMatch && activeLogos.length > 0) {
            try {
                agentRun.setSteps((steps) => [
                    ...steps,
                    {
                        id: `overlay-${Date.now()}`,
                        text: t('workspace.applyingLogoOverlay'),
                        status: AGENTIC_STEP_STATUS.WORKING
                    }
                ]);
                const logoName = overlayMatch[1].toLowerCase();
                const position = overlayMatch[2].trim();
                const size = parseFloat(overlayMatch[3]) || 0.15;
                const targetLogo = activeLogos.find((logo) => logo.name.toLowerCase().includes(logoName))
                    || activeLogos[0];
                if (targetLogo) {
                    finalImageUrl = await applyLogoOverlay(imageResponse.imageUrl, targetLogo.data, {
                        position,
                        size
                    });
                }
            } catch (overlayError) {
                console.error('Logo overlay failed', overlayError);
            }
        }

        results.setVersions((previous) => previous.map((version, index) => (index === newVersionIndex
            ? {
                ...version,
                imageUrl: finalImageUrl,
                imageModel: imageResponse.model,
                imagePrompt,
                imageAssetId: generatedArtifact.asset.id,
                imageRevisions: [generatedArtifact.asset]
            }
            : version)));
agentRun.setSteps((steps) => settleSteps(steps));
        recordUsage('image');
        return { imageUrl: finalImageUrl, failures: [] };
    }, [agentRun, agenticMode, imageConfig, models, recordUsage, results, t]);

    const runDirectRun = useCallback(async ({ prompt, projectId, isIteration }) => {
        const { context: brandContext } = readBrandContext();
        const { activeLogos, templateAssets, generationAssets } = collectGenerationAssets();
        const currentVersions = Array.isArray(results.versions) ? results.versions : [];
        const controllerSignal = agentRun.getRunSignal();

        agentRun.setSteps([
            createStep(1, t('Agent.analyzing'), AGENTIC_STEP_STATUS.COMPLETED),
            createStep(2, t('Agent.generating'), AGENTIC_STEP_STATUS.WORKING)
        ]);
        agentRun.setAgentState(AGENT_STATES.GENERATING);

        const isCasualPrompt = isCasualChatPrompt(prompt);
        const hasInitialImage = Boolean(media.attachedMedia || templateAssets[0] || generationAssets[0]);
        const isEditIntent = !isCasualPrompt && hasInitialImage && isImageEditRequest(prompt);
        const isFreshGenIntent = !isCasualPrompt && !isEditIntent && shouldAllowAutoImage(prompt, hasInitialImage);

        const selectedPrimaryAsset = media.attachedMedia || templateAssets[0] || generationAssets[0] || null;
        const imageUrls = [selectedPrimaryAsset?.data, ...generationAssets.map((asset) => asset.data)]
            .filter(Boolean)
            .filter((value, index, arr) => arr.indexOf(value) === index);
        const modelSupportsVisualInput = supportsVisualInputModel(models.textModel);
        const aiReadableImageUrls = modelSupportsVisualInput ? imageUrls : [];
        const currentImageUrl = imageUrls[0] || null;

        let fullPrompt = prompt;
        let iterativeContext = '';

        if (imageUrls.length > 0 && !modelSupportsVisualInput) {
            agentRun.openInfoNotice(
                t('errors.visionNotSupportedTitle'),
                t('errors.visionNotSupportedMessage')
            );
            fullPrompt = `${fullPrompt}\n\n${t('errors.visionFallbackNote')} If user asks visual edits, imitate style from text instructions and keep brand consistency.`;
        }

        let baseVersionPrompt = results.currentPrompt;
        let scopedHistory = [];
        const safeBaseVersionIndex = results.getSafeIndex(results.currentVersionIndex);
        const baseVersion = safeBaseVersionIndex >= 0 ? currentVersions[safeBaseVersionIndex] : null;

        if (isIteration && currentVersions.length > 0) {
            scopedHistory = getScopedHistory(results.history, safeBaseVersionIndex);
            const historyContext = buildHistoryContext(scopedHistory);
            baseVersionPrompt = baseVersion?.prompt || results.currentPrompt || '';
            const baseDraftContext = baseVersion?.result
                ? `\n\nCurrent draft to refine:\n${baseVersion.result}`
                : '';
            fullPrompt = `${historyContext}${baseDraftContext}\n\nUser request: ${prompt}\n\nPlease update the content based on this new request.`;

            if (baseVersion?.imageUrl && !currentImageUrl) {
                iterativeContext = '\n\nCURRENT VISUAL: There is already an image. If the user asks to modify the visual, describe the NEW image prompt in the [GENERATE_IMAGE: ...] tag, taking the previous one as reference.';
            }
        }

        const shouldInjectCreativeContext = !isCasualPrompt && (
            isImageEditRequest(prompt)
            || shouldAllowAutoImage(prompt, Boolean(currentImageUrl))
            || Boolean(currentImageUrl && generationAssets.length > 0)
        );

        if (shouldInjectCreativeContext) {
            fullPrompt = `${fullPrompt}${buildTaskModeInstruction(creativeTaskMode)}${getBrandAssetContext(generationAssets, media.getAssetRoleLabel)}`;
        }

        if (brandContext && !isCasualPrompt) {
            fullPrompt = `${fullPrompt}\n\n${brandContext}`;
        }

        if (currentImageUrl && imageProcessingMode === 'analysis_send' && modelSupportsVisualInput) {
            try {
                const analysis = await analyzeImage(
                    currentImageUrl,
                    t('workspace.imageAnalysisPrompt'),
                    { signal: controllerSignal }
                );
                if (analysis?.success && analysis.analysis) {
                    fullPrompt = `${fullPrompt}\n\n${t('workspace.imageAnalysisPrefix')}\n${analysis.analysis}\n\n${t('workspace.imageAnalysisSuffix')}`;
                }
            } catch (analysisError) {
                console.warn('Image analysis step failed, continuing with send-only flow.', analysisError);
            }
        }

        const shouldDirectGenerateFromEdit = Boolean(currentImageUrl)
            && imageProcessingMode === 'smart'
            && !isCasualPrompt
            && isImageEditRequest(prompt);

        if (shouldDirectGenerateFromEdit) {
            const directOutcome = await runDirectImageEdit({
                prompt,
                projectId,
                isIteration,
                imageUrls,
                activeLogos,
                baseVersionPrompt,
                scopedHistory,
                currentVersions
            });
            if (directOutcome) {
                await persistOutcome({
                    projectId,
                    status: PROJECT_STATUS.COMPLETE,
                    result: directOutcome.cleanText,
                    imageUrl: directOutcome.imageUrl,
                    prompt: directOutcome.nextPromptValue,
                    history: directOutcome.nextHistory,
                    versions: directOutcome.versionsSnapshot,
                    currentVersionIndex: directOutcome.newVersionIndex,
                    isIteration
                });
                return;
            }
        }

        const activeSystemPrompt = (isEditIntent || isFreshGenIntent)
            ? buildMasterSystemPrompt({
                logoNames: activeLogos.map((logo) => logo.name).join(', ') || 'brand',
                activeLogoNames: activeLogos.map((logo) => logo.name).join(', ') || 'none',
                iterativeContext
            })
            : CONVERSATIONAL_SYSTEM_PROMPT;

        const response = await sendToAI(fullPrompt, models.textModel, {
            imageUrl: aiReadableImageUrls[0] || null,
            imageUrls: aiReadableImageUrls,
            systemPrompt: activeSystemPrompt,
            signal: controllerSignal
        });

        if (!response.success) throw new Error(response.error || 'AI_REQUEST_FAILED');

        media.setAttachedMedia(null);

        const textContent = typeof response.content === 'string' ? response.content.trim() : '';
        if (!textContent) throw new Error('EMPTY_AI_RESPONSE');

        const imageMatch = textContent.match(IMAGE_TAG_REGEX);
        const overlayMatch = textContent.match(OVERLAY_TAG_REGEX);
        const strippedText = textContent.replace(IMAGE_TAG_REGEX, '').replace(OVERLAY_TAG_REGEX, '').trim();
        if (!strippedText && !imageMatch) throw new Error('EMPTY_AI_RESPONSE');
        const cleanText = strippedText || t('workspace.visualGeneratedNoText');

        const newUserMessage = { role: 'user', content: prompt };
        const textAssistantMessage = { role: 'assistant', content: cleanText };
        const nextHistory = isIteration
            ? [...scopedHistory, newUserMessage, textAssistantMessage]
            : [newUserMessage, textAssistantMessage];
        results.setHistory(nextHistory);

        const newVersion = {
            type: 'text',
            prompt,
            result: cleanText,
            model: response.model,
            timestamp: new Date().toISOString(),
            isNew: true,
            steps: [
                createStep(1, t('Agent.analyzing'), AGENTIC_STEP_STATUS.COMPLETED),
                createStep(2, t('Agent.generating'), AGENTIC_STEP_STATUS.COMPLETED)
            ]
        };

        const versionsSnapshot = [...currentVersions, newVersion];
        const newVersionIndex = versionsSnapshot.length - 1;
        results.setVersions(versionsSnapshot);
        results.setCurrentVersionIndex(newVersionIndex);

const allowAutoImage = shouldAllowAutoImage(prompt, Boolean(currentImageUrl));
        const requestedImagePrompt = imageMatch?.[1]?.trim() || (allowAutoImage ? prompt : '');
        let currentImageResult = null;
        let visualFailures = [];

if (requestedImagePrompt && allowAutoImage && gateAction('image')) {
            const visualOutcome = await generateRequestedVisual({
                requestedImagePrompt,
                projectId,
                prompt,
                brandContext,
                imageUrls,
                activeLogos,
                overlayMatch,
                newVersionIndex
            });
currentImageResult = visualOutcome?.imageUrl || null;
            visualFailures = visualOutcome?.failures || [];
        }

        if (visualFailures.length > 0) {
            results.setVersions((previous) => previous.map((version, index) => (index === newVersionIndex
                ? {
                    ...version,
                    agenticFailures: visualFailures,
                    agenticPartial: Boolean(currentImageResult),
                    agenticRetryable: true
                }
                : version)));
        }

        agentRun.setSteps((steps) => settleSteps(steps));
        agentRun.setAgentState(AGENT_STATES.COMPLETE);
        recordUsage('generate');
        if (isIteration) recordUsage('iteration');
        trackMetric(isIteration ? 'iteration_success' : 'generation_success', {
            projectId,
            hasImage: Boolean(currentImageResult),
            model: response.model,
            imageModel: models.imageModel
        });

        const outcomeVersion = visualFailures.length > 0
            ? {
                ...versionsSnapshot[newVersionIndex],
                agenticFailures: visualFailures,
                agenticPartial: Boolean(currentImageResult),
                agenticRetryable: true
            }
            : versionsSnapshot[newVersionIndex];

        await persistOutcome({
            projectId,
            status: PROJECT_STATUS.COMPLETE,
            result: cleanText,
            imageUrl: currentImageResult || versionsSnapshot[newVersionIndex]?.imageUrl || null,
            prompt: isIteration ? `${baseVersionPrompt}\n> ${prompt}` : prompt,
            history: nextHistory,
            versions: versionsSnapshot.map(
                (version, index) => (index === newVersionIndex ? outcomeVersion : version)
            ),
            currentVersionIndex: newVersionIndex,
            isIteration
        });
    }, [
        agentRun,
        collectGenerationAssets,
        creativeTaskMode,
        gateAction,
        generateRequestedVisual,
        imageProcessingMode,
        media,
        models,
        persistOutcome,
readBrandContext,
        recordUsage,
        results,
        runDirectImageEdit,
        t
    ]);

    const runAgenticRun = useCallback(async ({ prompt, projectId, isIteration }) => {
        const { context: brandContext, assetIds: brandAssetIds } = readBrandContext();
        const { generationAssets } = collectGenerationAssets();
        const sourceImages = [
            media.attachedMedia?.data,
            ...generationAssets.map((asset) => asset.data)
        ].filter(Boolean).filter((value, index, values) => values.indexOf(value) === index);

        agentRun.setSteps([createStep('agentic-plan', t('agentic.planning'), AGENTIC_STEP_STATUS.WORKING)]);
        agentRun.setAgentState(AGENT_STATES.ANALYZING);

        const agenticResult = await executeAgenticPipeline({
            prompt,
            selectedTextModel: models.textModel,
            selectedImageModel: models.imageModel,
            visionModel: models.visionModel,
            imageConfig: (agenticMode || ALLOW_IMAGE_CONFIG_WITHOUT_AGENTIC) ? imageConfig : {},
            sourceImages,
            projectId,
            projectName: results.currentPrompt || prompt,
            version: results.versions.length + 1,
            preferNativeTools: preferNativeTools(),
            preferOpenRouterImageTool: true,
            t,
            signal: agentRun.getRunSignal(),
            onSteps: agentRun.publishSteps,
            onChunk: agentRun.setDisplayedText,
            brandContext,
            brandAssetIds,
            hasVisualReference: generationAssets.length > 0 || Boolean(media.attachedMedia)
        });

        agentRun.setPendingArtifactSaves(agenticResult.pendingSaves || []);

        const cleanText = agenticResult.text.trim();
        const newUserMessage = { role: 'user', content: prompt };
        const textAssistantMessage = { role: 'assistant', content: cleanText };
        const nextHistory = isIteration
            ? [...results.history, newUserMessage, textAssistantMessage]
            : [newUserMessage, textAssistantMessage];
        const newVersion = {
            type: 'agentic',
            prompt,
            result: cleanText,
            model: agenticResult.model,
            imageUrl: agenticResult.imageUrl,
            imageModel: agenticResult.imageModel,
            imagePrompt: agenticResult.imagePrompt,
            imageAssetId: agenticResult.images?.at(-1)?.assetId || null,
            imageRevisions: agenticResult.images || [],
            timestamp: new Date().toISOString(),
            isNew: true,
            agenticSteps: agenticResult.plan,
            agenticFailures: agenticResult.failures || [],
            agenticPartial: Boolean(agenticResult.partial),
            agenticRetryable: Boolean(agenticResult.retryable),
            steps: buildVersionSteps(agenticResult.plan)
        };
        const versionsSnapshot = [...results.versions, newVersion];
        const newVersionIndex = versionsSnapshot.length - 1;

        media.setAttachedMedia(null);
        results.setHistory(nextHistory);
        results.setVersions(versionsSnapshot);
        results.setCurrentVersionIndex(newVersionIndex);
        agentRun.setSteps((steps) => settleSteps(steps));
        agentRun.setAgentState(AGENT_STATES.COMPLETE);

        recordUsage('generate');
        if (isIteration) recordUsage('iteration');
        if (agenticResult.imageUrl) recordUsage('image');
        trackMetric('agentic_complete', {
            projectId,
            model: models.textModel,
            imageModel: agenticResult.imageModel,
            stepCount: agenticResult.plan.length,
            hasImage: Boolean(agenticResult.imageUrl),
            failedSteps: (agenticResult.failures || []).length,
            partial: Boolean(agenticResult.partial)
        });

        await persistOutcome({
            projectId,
            status: PROJECT_STATUS.COMPLETE,
            result: cleanText,
            imageUrl: agenticResult.imageUrl,
            prompt: isIteration ? `${results.currentPrompt}\n> ${prompt}` : prompt,
            history: nextHistory,
            versions: versionsSnapshot,
            currentVersionIndex: newVersionIndex,
            isIteration
        });
    }, [
        agentRun,
        agenticMode,
collectGenerationAssets,
        imageConfig,
        media,
        models,
        persistOutcome,
        readBrandContext,
        recordUsage,
        results,
        t
    ]);

    const startGeneration = useCallback(async (prompt, isIteration = false) => {
        if (agentRun.isGenerating) return;
        const normalizedPrompt = typeof prompt === 'string' ? prompt.trim() : String(prompt || '').trim();
if (!normalizedPrompt) return;
        if (!isAIConfigured()) {
            markNotConfigured();
            return;
        }
        // A visual request cannot succeed without an image-capable model, and
        // the user is never told to register one. Detect it here, before the
        // request is spent, and point at the step that fixes it.
        if (!isImageGenerationConfigured() && looksLikeVisualRequest(normalizedPrompt, Boolean(media.attachedMedia))) {
            markImageModelMissing();
            return;
        }
        if (!isIteration && !currentProjectId && !gateAction('project')) return;
        if (!gateAction('generate')) return;
        if (isIteration && !gateAction('iteration', { currentProjectIterations: results.versions.length })) return;

        agentRun.trackRequest({ prompt: normalizedPrompt, isIteration, projectId: currentProjectId });
        agentRun.beginRun({ isIteration });

        const controller = agentRun.createRunController();
        agentRun.armSlowNoticeTimer(controller);

        let projectId = currentProjectId;
        try {
            onProjectStatusChange(PROJECT_STATUS.GENERATING);

            if (!isIteration) {
                const localProject = await saveLocalProject({
                    id: projectId || undefined,
                    name: normalizedPrompt.substring(0, 50),
                    prompt: normalizedPrompt,
type: 'content',
                    status: PROJECT_STATUS.GENERATING,
                    errorMessage: '',
                    createdAt: new Date().toISOString()
                });
                projectId = localProject.id;
                onProjectIdChange(projectId);
                agentRun.trackRequest({ prompt: normalizedPrompt, isIteration, projectId });
                await projects.loadProjects();
            }

            if (agenticMode) {
                await runAgenticRun({ prompt: normalizedPrompt, projectId, isIteration });
                return;
            }

            await runDirectRun({ prompt: normalizedPrompt, projectId, isIteration });
        } catch (error) {
            if (isAbortError(error)) {
                agentRun.cancelRun(t('errors.requestAborted'));
                return;
            }
            const normalized = agentRun.notifyAIError(error.message || 'AI_REQUEST_FAILED');
            onProjectStatusChange(PROJECT_STATUS.ERROR);
            agentRun.markRunFailed(normalized);
            await persistRunError({ projectId, normalizedPrompt, normalized });
        } finally {
            agentRun.endRun();
        }
    }, [
        agentRun,
        agenticMode,
        currentProjectId,
gateAction,
        markImageModelMissing,
        markNotConfigured,
        media.attachedMedia,
        onProjectIdChange,
        onProjectStatusChange,
        persistRunError,
        projects,
        results,
        runAgenticRun,
        runDirectRun,
        t
    ]);

    return { startGeneration, markNotConfigured, markImageModelMissing };
}