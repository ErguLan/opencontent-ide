/**
 * useWorkspaceAI
 * OpenContent IDE
 *
 * Encapsulates the AI generation flow used by the workspace.
 * Keeps Workspace.jsx focused on UI.
 */

import { useState, useRef, useCallback } from 'react';
import {
    isAIConfigured,
    sendToAI,
    generateImage,
    analyzeImage,
    supportsVisualInputModel,
    isStreamingEnabled
} from '../../../services/ai';
import { applyLogoOverlay } from '../../../utils/imageProcessor';
import { saveLocalProject } from '../../../services/projectsLocal';
import { saveMedia } from '../../../services/mediaService';
import { executeAgenticPipeline } from '../../../services/ai/agenticPipeline';

const AGENT_STATES = {
    IDLE: 'idle',
    ANALYZING: 'analyzing',
    GENERATING: 'generating',
    COMPLETE: 'complete',
    ERROR: 'error',
    NOT_CONFIGURED: 'not_configured'
};

function isCasualChatPrompt(promptText) {
    const text = String(promptText || '').trim().toLowerCase();
    const compact = text.replace(/[!?.:,;]/g, '').trim();
    const tokens = compact.split(/\s+/).filter(Boolean);
    const greetingOnly = /^(hola|hello|hi|hey|que onda|que tal|buenas|buen dia|buenos dias|buenas tardes|buenas noches)$/.test(compact);
    const shortCasual = /^(hola|hello|hi|hey|gracias|thanks|ok|vale|va|listo)$/.test(compact) || tokens.length <= 2;
    return greetingOnly || shortCasual;
}

function isImageEditRequest(promptText) {
    const text = String(promptText || '').toLowerCase();
    const hasAction = /(edita|editar|edit|retoca|retouch|modifica|modify|ajusta|improve|mejora|cambia|change|aplica|apply|pon|put)/.test(text);
    const hasVisualContext = /(imagen|image|template|visual|foto|photo|diseno|dise.o|estilo|style|color|iluminacion|lighting|fondo|background|efecto|effect)/.test(text);
    return hasAction && hasVisualContext;
}

function shouldAllowAutoImage(promptText, hasAttachedImage) {
    if (hasAttachedImage) return true;
    const text = String(promptText || '').toLowerCase();
    return /(image|imagen|photo|foto|thumbnail|poster|cover|banner|visual|design|disena|dise.a|logo|ilustracion|ilustraci.n|render|mockup)/.test(text);
}

function buildAssetContext(assets, t) {
    if (!Array.isArray(assets) || assets.length === 0) return '';
    const getRoleLabel = (role) => {
        const map = {
            logo: t('workspace.media.roleLogo'),
            template: t('workspace.media.roleTemplate'),
            reference: t('workspace.media.roleReference'),
            overlay: t('workspace.media.roleOverlay')
        };
        return map[role] || role;
    };
    const lines = assets.map((asset, index) => `${index + 1}. ${getRoleLabel(asset.role || 'reference')}: ${asset.name || 'asset'}`);
    return `\n\n${t('workspace.assetContextPrefix')}\n${lines.join('\n')}`;
}

function buildTaskModeInstruction(mode, t) {
    if (mode === 'from_scratch') {
        return `\n\n${t('workspace.taskModeFromScratch')}`;
    }
    return `\n\n${t('workspace.taskModeEditTemplate')}`;
}

export function useWorkspaceAI({
    t,
    mediaAssets,
    activeAssetIds,
    attachedMedia,
    setAttachedMedia,
    imageProcessingMode,
    creativeTaskMode,
    onNotify,
    onIncrementUsage,
    onTrackMetric
}) {
    const [agentState, setAgentState] = useState(AGENT_STATES.IDLE);
    const [errorMessage, setErrorMessage] = useState('');
    const [versions, setVersions] = useState([]);
    const [currentVersionIndex, setCurrentVersionIndex] = useState(-1);
    const [agentSteps, setAgentSteps] = useState([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isIterating, setIsIterating] = useState(false);
    const [isGeneratingImage, setIsGeneratingImage] = useState(false);
    const [displayedText, setDisplayedText] = useState('');
    const lastTypedVersionIndex = useRef(-1);
    const generationAbortControllerRef = useRef(null);
    const slowGenerationNoticeTimerRef = useRef(null);
    const wasStreamedRef = useRef(false);

    const isWorking = agentState === AGENT_STATES.ANALYZING || agentState === AGENT_STATES.GENERATING;

    const normalizeAIError = useCallback((message) => {
        if (!message) return t('errors.generic');
        if (message === 'API_KEY_NOT_CONFIGURED' || message.includes('API_KEY')) {
            return t('errors.apiKeyNotConfigured');
        }
        if (message === 'REQUEST_TIMEOUT') return t('errors.requestTimeout');
        if (message === 'REQUEST_ABORTED') return t('errors.requestAborted');
        if (message === 'EMPTY_AI_RESPONSE') return t('errors.emptyAIResponse');
        if (message === 'AI_REQUEST_FAILED') return t('errors.aiRequestFailed');
        if (message.includes('NO_IMAGE_IN_RESPONSE')) return t('errors.noImageInResponse');
        if (message === 'IMAGE_GENERATION_FAILED' || message === 'IMAGE_ANALYSIS_FAILED') {
            return t('errors.imageGenerationFailed');
        }
        if (message === 'IMAGE_GENERATION_NOT_SUPPORTED') return t('errors.imageGenerationNotSupported');
        return message;
    }, [t]);

    const clearSlowGenerationNoticeTimer = useCallback(() => {
        if (slowGenerationNoticeTimerRef.current) {
            clearTimeout(slowGenerationNoticeTimerRef.current);
            slowGenerationNoticeTimerRef.current = null;
        }
    }, []);

    const cancelCurrentGeneration = useCallback((customMessage = t('errors.requestAborted')) => {
        clearSlowGenerationNoticeTimer();
        if (generationAbortControllerRef.current) {
            generationAbortControllerRef.current.abort();
            generationAbortControllerRef.current = null;
        }
        setAgentState(AGENT_STATES.ERROR);
        setErrorMessage(customMessage);
        setIsGenerating(false);
        setIsIterating(false);
    }, [clearSlowGenerationNoticeTimer, t]);

    const getSafeVersionIndex = useCallback((index, list = versions) => {
        if (!Array.isArray(list) || list.length === 0) return -1;
        const normalized = Number.isInteger(index) ? index : list.length - 1;
        return Math.min(Math.max(normalized, 0), list.length - 1);
    }, [versions]);

    const getScopedHistory = useCallback((allHistory, versionIndex) => {
        if (!Array.isArray(allHistory) || allHistory.length === 0 || versionIndex < 0) return [];
        const maxEntries = (versionIndex + 1) * 2;
        return allHistory.slice(0, Math.min(allHistory.length, maxEntries));
    }, []);

    const typewriterEffect = useCallback((text, versionIndex) => {
        if (lastTypedVersionIndex.current === versionIndex) return;
        lastTypedVersionIndex.current = versionIndex;
        let index = 0;
        setDisplayedText('');
        const timer = setInterval(() => {
            setDisplayedText(text.substring(0, index + 1));
            index++;
            if (index >= text.length) clearInterval(timer);
        }, 5);
    }, []);

    // Agentic loop shared with the active Workspace implementation.
    const executeAgenticPlan = async ({
        prompt, projectId, history,
        selectedTextModel, selectedImageModel,
        requestController, onProjectUpdate,
        imageConfig = {}, visionModel = null
    }) => {
        const sourceImages = [attachedMedia?.data, ...mediaAssets
            .filter((asset) => activeAssetIds.includes(asset.id))
            .map((asset) => asset.data)]
            .filter(Boolean);
        const result = await executeAgenticPipeline({
            prompt,
            selectedTextModel,
            selectedImageModel,
            visionModel,
            imageConfig,
            sourceImages,
            projectId,
            projectName: prompt,
            version: versions.length + 1,
            t,
            signal: requestController.signal,
            onSteps: setAgentSteps,
            onChunk: setDisplayedText
        });

        wasStreamedRef.current = true;
        const finalText = result.text || prompt;
        const finalImageUrl = result.imageUrl || null;
        const newVersion = {
            type: 'agentic', prompt, result: finalText, imageUrl: finalImageUrl,
            model: result.model || selectedTextModel,
            imageModel: result.imageModel,
            imagePrompt: result.imagePrompt,
            imageAssetId: result.images?.at(-1)?.assetId || null,
            imageRevisions: result.images || [],
            timestamp: new Date().toISOString(), isNew: true,
            agenticSteps: result.plan,
            steps: result.plan.map((step, index) => ({
                id: `agentic-${index}`,
                text: step.description || step.prompt,
                status: 'done'
            }))
        };
        const versionsSnapshot = [...versions, newVersion];
        setVersions(versionsSnapshot);
        setCurrentVersionIndex(versionsSnapshot.length - 1);
        setAgentSteps((prev) => prev.map((s) => ({ ...s, status: 'done' })));
        setAgentState(AGENT_STATES.COMPLETE);

        onIncrementUsage?.({
            generate: result.plan.filter((step) => step.type === 'text' || step.type === 'chat').length,
            image: result.images.length
        });
        onTrackMetric?.('agentic_complete', { stepCount: result.plan.length, images: result.images.length });

        await onProjectUpdate?.({
            projectId, prompt, result: finalText, imageUrl: finalImageUrl,
            history: [...(history || []), { role: 'user', content: prompt }, { role: 'assistant', content: finalText }],
            versions: versionsSnapshot, currentVersionIndex: versionsSnapshot.length - 1
        });
    };

    const startGeneration = useCallback(async ({
        prompt,
        isIteration = false,
        currentProjectId,
        currentPrompt,
        currentVersionIndex: baseVersionIndex,
        history,
        selectedTextModel,
         selectedImageModel,
         imageConfig = {},
         visionModel = null,
         onProjectCreate,
        onProjectUpdate,
        agenticMode = false
    }) => {
        if (isGenerating) return;
        if (!isAIConfigured()) {
            setAgentState(AGENT_STATES.NOT_CONFIGURED);
            setErrorMessage(t('errors.apiKeyNotConfigured'));
            onNotify?.(t('errors.apiKeyNotConfiguredTitle'), t('errors.apiKeyNotConfigured'));
            return;
        }

        setIsGenerating(true);
        setIsIterating(isIteration);
        const requestController = new AbortController();
        generationAbortControllerRef.current = requestController;
        setAgentState(AGENT_STATES.ANALYZING);
        setErrorMessage('');
        setAgentSteps([{ id: 1, text: t('Agent.analyzing'), status: 'working' }]);
        clearSlowGenerationNoticeTimer();
        slowGenerationNoticeTimerRef.current = setTimeout(() => {
            if (generationAbortControllerRef.current === requestController) {
                onNotify?.(t('errors.slowGenerationTitle'), t('errors.slowGenerationMessage'));
            }
        }, 18000);

        try {
            let projectId = currentProjectId;
            if (!isIteration) {
                if (onProjectCreate) {
                    projectId = await onProjectCreate?.({ prompt });
                } else {
                    const newProj = await saveLocalProject({
                        name: prompt.substring(0, 50),
                        prompt,
                        type: 'content',
                        createdAt: new Date().toISOString()
                    });
                    projectId = newProj.id;
                }
            }

            // Agentic mode: multi-step pipeline
            if (agenticMode) {
                await executeAgenticPlan({
                    prompt, projectId, isIteration,
                    baseVersionIndex, history,
                    selectedTextModel, selectedImageModel,
                    requestController, onProjectUpdate, imageConfig, visionModel
                });
                return;
            }

            setAgentSteps([
                { id: 1, text: t('Agent.analyzing'), status: 'done' },
                { id: 2, text: t('Agent.generating'), status: 'working' }
            ]);
            setAgentState(AGENT_STATES.GENERATING);

            const activeAssets = mediaAssets.filter((asset) => activeAssetIds.includes(asset.id));
            const activeLogos = activeAssets.filter((asset) => asset.role === 'logo');
            const templateAssets = activeAssets.filter((asset) => asset.role === 'template');

            const isCasualPrompt = isCasualChatPrompt(prompt);
            const hasInitialImage = Boolean(attachedMedia || templateAssets[0] || activeAssets[0]);
            const isEditIntent = !isCasualPrompt && hasInitialImage && isImageEditRequest(prompt);
            const isFreshGenIntent = !isCasualPrompt && !isEditIntent && shouldAllowAutoImage(prompt, hasInitialImage);

            const selectedPrimaryAsset = attachedMedia || templateAssets[0] || activeAssets[0] || null;
            const imageUrls = [selectedPrimaryAsset?.data, ...activeAssets.map((asset) => asset.data)]
                .filter(Boolean)
                .filter((value, index, arr) => arr.indexOf(value) === index);
            const modelSupportsVisualInput = supportsVisualInputModel(selectedTextModel);
            const aiReadableImageUrls = modelSupportsVisualInput ? imageUrls : [];
            let currentImageUrl = imageUrls[0] || null;

            let fullPrompt = prompt;
            let iterativeContext = '';

            if (imageUrls.length > 0 && !modelSupportsVisualInput) {
                onNotify?.(t('errors.visionNotSupportedTitle'), t('errors.visionNotSupportedMessage'));
                fullPrompt = `${fullPrompt}\n\n${t('errors.visionFallbackNote')}`;
            }

            let baseVersionPrompt = currentPrompt;
            let scopedHistory = [];
            const safeBaseVersionIndex = getSafeVersionIndex(baseVersionIndex);
            const baseVersion = safeBaseVersionIndex >= 0 ? versions[safeBaseVersionIndex] : null;
            const assetContext = buildAssetContext(activeAssets, t);
            const taskModeInstruction = buildTaskModeInstruction(creativeTaskMode, t);

            if (isIteration && versions.length > 0) {
                scopedHistory = getScopedHistory(history, safeBaseVersionIndex);
                const historyContext = scopedHistory
                    .map((item) => `${item.role === 'user' ? 'User' : 'Assistant'}: ${item.content}`)
                    .join('\n\n');
                baseVersionPrompt = baseVersion?.prompt || currentPrompt || '';
                const baseDraftContext = baseVersion?.result
                    ? `\n\n${t('workspace.currentDraftPrefix')}\n${baseVersion.result}`
                    : '';
                fullPrompt = `${historyContext}${baseDraftContext}\n\n${t('workspace.userRequestPrefix')}${prompt}\n\n${t('workspace.updateRequestSuffix')}`;

                if (baseVersion?.imageUrl && !currentImageUrl) {
                    iterativeContext = `\n\n${t('workspace.currentVisualNote')}`;
                }
            }

            const shouldInjectCreativeContext = !isCasualPrompt && (
                isImageEditRequest(prompt) ||
                shouldAllowAutoImage(prompt, Boolean(currentImageUrl)) ||
                Boolean(currentImageUrl && activeAssets.length > 0)
            );

            if (shouldInjectCreativeContext) {
                fullPrompt = `${fullPrompt}${taskModeInstruction}${assetContext}`;
            }

            if (currentImageUrl && imageProcessingMode === 'analysis_send' && modelSupportsVisualInput) {
                try {
                    const analysis = await analyzeImage(
                        currentImageUrl,
                        t('workspace.imageAnalysisPrompt'),
                        {
                            signal: requestController.signal,
                            visionModel
                        }
                    );
                    if (analysis?.success && analysis.analysis) {
                        fullPrompt = `${fullPrompt}\n\n${t('workspace.imageAnalysisPrefix')}\n${analysis.analysis}\n\n${t('workspace.imageAnalysisSuffix')}`;
                    }
                } catch (analysisError) {
                    console.warn('Image analysis step failed, continuing.', analysisError);
                }
            }

            const shouldDirectGenerateFromEdit =
                currentImageUrl &&
                imageProcessingMode === 'smart' &&
                !isCasualPrompt &&
                isImageEditRequest(prompt);

            if (shouldDirectGenerateFromEdit) {
                setAgentSteps((prev) => [
                    ...prev.map((s) => ({ ...s, status: 'done' })),
                    { id: 3, text: t('workspace.generatingEditedVisual'), status: 'working' }
                ]);

                const logoLine = activeLogos.length > 0
                    ? `\n${t('workspace.incorporateLogosPrefix')}${activeLogos.map((asset) => asset.name).join(', ')}.`
                    : '';
                const smartImagePrompt = `${t('workspace.editImagePromptPrefix')}\n${t('workspace.userRequestPrefix')}${prompt}${logoLine}\n${t('workspace.editImagePromptSuffix')}`;
                const directImage = await generateImage(smartImagePrompt, selectedImageModel, { signal: requestController.signal });

                if (directImage?.success) {
                    setAttachedMedia(null);
                    const cleanText = t('workspace.visualEditApplied');
                    const newUserMessage = { role: 'user', content: prompt };
                    const textAssistantMessage = { role: 'assistant', content: cleanText };
                    const nextHistory = isIteration
                        ? [...scopedHistory, newUserMessage, textAssistantMessage]
                        : [newUserMessage, textAssistantMessage];

                    const newVersion = {
                        type: 'text',
                        prompt,
                        result: cleanText,
                        model: directImage.model || `visual:${selectedImageModel}`,
                        imageUrl: directImage.imageUrl,
                        imageModel: directImage.model || selectedImageModel,
                        imagePrompt: smartImagePrompt,
                        timestamp: new Date().toISOString(),
                        isNew: true,
                        steps: [
                            { id: 1, text: t('workspace.stepDetectedEdit'), status: 'done' },
                            { id: 2, text: t('workspace.stepGeneratedVisual'), status: 'done' }
                        ]
                    };

                    const versionsSnapshot = [...versions, newVersion];
                    const newVersionIndex = versionsSnapshot.length - 1;
                    setVersions(versionsSnapshot);
                    setCurrentVersionIndex(newVersionIndex);
                    setAgentSteps((prev) => prev.map((step) => ({ ...step, status: 'done' })));
                    setAgentState(AGENT_STATES.COMPLETE);
                    if (!wasStreamedRef.current) typewriterEffect(cleanText, newVersionIndex);

                    onIncrementUsage?.({ generate: 1, image: 1, iteration: isIteration ? 1 : 0 });
                    onTrackMetric?.('smart_direct_image_edit_success', { imageModel: directImage.model || selectedImageModel });

                    await onProjectUpdate?.({
                        projectId,
                        prompt: isIteration ? `${baseVersionPrompt}\n> ${prompt}` : prompt,
                        result: cleanText,
                        imageUrl: directImage.imageUrl,
                        history: nextHistory,
                        versions: versionsSnapshot,
                        currentVersionIndex: newVersionIndex
                    });
                    setIsGenerating(false);
                    setIsIterating(false);
                    return;
                }
                console.warn('Smart direct image generation failed, falling back to text+image flow.');
            }

            const masterPrompt = `${t('workspace.masterSystemPrompt')}\n${activeLogos.length > 0 ? `\n${t('workspace.logoProtectionPrompt')}${activeLogos.map((l) => l.name).join(', ')}` : ''}\n${iterativeContext}`;
            const conversationalPrompt = t('workspace.conversationalSystemPrompt');
            const activeSystemPrompt = (isEditIntent || isFreshGenIntent) ? masterPrompt : conversationalPrompt;

            const stream = isStreamingEnabled();
            wasStreamedRef.current = stream;
            const response = await sendToAI(fullPrompt, selectedTextModel, {
                imageUrl: aiReadableImageUrls[0] || null,
                imageUrls: aiReadableImageUrls,
                systemPrompt: activeSystemPrompt,
                signal: requestController.signal,
                stream,
                onChunk: stream ? (_chunk, accumulated) => setDisplayedText(accumulated) : undefined
            });

            if (!response.success) throw new Error(response.error || 'Generation failed');

            setAttachedMedia(null);
            let textContent = typeof response.content === 'string' ? response.content.trim() : '';
            if (!textContent) throw new Error('EMPTY_AI_RESPONSE');

            const imageTagRegex = /\[GENERATE_IMAGE:\s*(.*?)\]/i;
            const overlayTagRegex = /\[LOGO_OVERLAY:\s*(.*?),\s*(.*?),\s*(.*?)\]/i;
            const match = textContent.match(imageTagRegex);
            const overlayMatch = textContent.match(overlayTagRegex);
            const strippedText = textContent.replace(imageTagRegex, '').replace(overlayTagRegex, '').trim();
            if (!strippedText && !match) throw new Error('EMPTY_AI_RESPONSE');
            const cleanText = strippedText || t('workspace.visualGeneratedNoText');

            let currentImageResult = null;
            const newUserMessage = { role: 'user', content: prompt };
            const textAssistantMessage = { role: 'assistant', content: cleanText };
            const nextHistory = isIteration
                ? [...scopedHistory, newUserMessage, textAssistantMessage]
                : [newUserMessage, textAssistantMessage];

            const newVersion = {
                type: 'text',
                prompt,
                result: cleanText,
                model: response.model,
                timestamp: new Date().toISOString(),
                isNew: true,
                steps: [
                    { id: 1, text: t('Agent.analyzing'), status: 'done' },
                    { id: 2, text: t('Agent.generating'), status: 'done' }
                ]
            };

            const versionsSnapshot = [...versions, newVersion];
            setVersions(versionsSnapshot);
            const newVersionIndex = versionsSnapshot.length - 1;
            setCurrentVersionIndex(newVersionIndex);
            if (!wasStreamedRef.current) typewriterEffect(cleanText, newVersionIndex);

            const allowAutoImage = shouldAllowAutoImage(prompt, Boolean(currentImageUrl));
            if (match && match[1] && allowAutoImage) {
                const imagePrompt = match[1];
                setAgentSteps((prev) => [
                    ...prev.map((s) => ({ ...s, status: 'done' })),
                    { id: `img-${Date.now()}`, text: t('workspace.generatingRequestedVisual'), status: 'working' }
                ]);

                const imgResponse = await generateImage(imagePrompt, selectedImageModel, { signal: requestController.signal });
                if (imgResponse.success) {
                    let finalImageUrl = imgResponse.imageUrl;
                    if (overlayMatch && activeLogos.length > 0) {
                        try {
                            setAgentSteps((prev) => [
                                ...prev,
                                { id: `overlay-${Date.now()}`, text: t('workspace.applyingLogoOverlay'), status: 'working' }
                            ]);
                            const logoName = overlayMatch[1].toLowerCase();
                            const pos = overlayMatch[2].trim();
                            const sizeVal = parseFloat(overlayMatch[3]) || 0.15;
                            const targetLogo = activeLogos.find((l) => l.name.toLowerCase().includes(logoName)) || activeLogos[0];
                            if (targetLogo) {
                                finalImageUrl = await applyLogoOverlay(imgResponse.imageUrl, targetLogo.data, { position: pos, size: sizeVal });
                            }
                        } catch (overlayErr) {
                            console.error('Logo overlay failed', overlayErr);
                        }
                    }
                    currentImageResult = finalImageUrl;
                    // Save to media library for gallery
                    try {
                        const blob = await (await fetch(finalImageUrl)).blob();
                        await saveMedia(blob, `generated-${Date.now()}.png`, {
                            role: 'reference',
                            tags: ['generated']
                        });
                    } catch { /* fail silently */ }
                    versionsSnapshot[newVersionIndex] = {
                        ...versionsSnapshot[newVersionIndex],
                        imageUrl: finalImageUrl,
                        imageModel: imgResponse.model,
                        imagePrompt
                    };
                    setVersions([...versionsSnapshot]);
                    setAgentSteps((prev) => prev.map((s) => ({ ...s, status: 'done' })));
                    onIncrementUsage?.({ image: 1 });
                } else {
                    onNotify?.(t('errors.imageToolError'), imgResponse.error || t('errors.imageGenerationFailed'));
                    setAgentSteps((prev) => prev.map((s) => s.status === 'working' ? { ...s, status: 'error', text: t('errors.imageToolError') } : s));
                }
            }

            setAgentState(AGENT_STATES.COMPLETE);
            onIncrementUsage?.({ generate: 1, iteration: isIteration ? 1 : 0 });
            onTrackMetric?.(isIteration ? 'iteration_success' : 'generation_success', {
                projectId,
                hasImage: Boolean(currentImageResult),
                model: response.model,
                imageModel: selectedImageModel
            });

            await onProjectUpdate?.({
                projectId,
                prompt: isIteration ? `${baseVersionPrompt}\n> ${prompt}` : prompt,
                result: cleanText,
                imageUrl: currentImageResult || versionsSnapshot[newVersionIndex]?.imageUrl || null,
                history: nextHistory,
                versions: versionsSnapshot,
                currentVersionIndex: newVersionIndex
            });

        } catch (error) {
            const normalized = normalizeAIError(error.message);
            setAgentState(AGENT_STATES.ERROR);
            setErrorMessage(normalized);
            onNotify?.(t('errors.generic'), normalized);
        } finally {
            clearSlowGenerationNoticeTimer();
            generationAbortControllerRef.current = null;
            setIsGenerating(false);
            setIsIterating(false);
        }
        // executeAgenticPlan is a closure function, not a hook dependency
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isGenerating, t, mediaAssets, activeAssetIds, attachedMedia, setAttachedMedia, imageProcessingMode, creativeTaskMode, onNotify, onIncrementUsage, onTrackMetric, versions, getSafeVersionIndex, getScopedHistory, typewriterEffect, normalizeAIError, clearSlowGenerationNoticeTimer]);

    const handleGenerateImage = useCallback(async ({ selectedImageModel, currentVersionIndex, versions, onProjectUpdate }) => {
        if (isGeneratingImage || versions.length === 0) return;
        const safeIndex = getSafeVersionIndex(currentVersionIndex, versions);
        const currentVersion = safeIndex >= 0 ? versions[safeIndex] : null;
        if (!currentVersion || currentVersion.imageUrl) return;

        setIsGeneratingImage(true);
        try {
            const imagePrompt = `${t('workspace.imageForVersionPrompt')}${currentVersion.prompt || currentVersion.result?.substring(0, 200)}`;
            const imgResponse = await generateImage(imagePrompt, selectedImageModel);
            if (imgResponse.success) {
                const updatedVersions = versions.map((v, i) =>
                    i === safeIndex
                        ? { ...v, imageUrl: imgResponse.imageUrl, imageModel: imgResponse.model, imagePrompt }
                        : v
                );
                setVersions(updatedVersions);
                onIncrementUsage?.({ image: 1 });
                onProjectUpdate?.({ versions: updatedVersions, currentVersionIndex: safeIndex });
            } else {
                onNotify?.(t('errors.imageGenerationFailed'), imgResponse.error || t('errors.generic'));
            }
        } catch (error) {
            onNotify?.(t('errors.imageGenerationFailed'), normalizeAIError(error.message));
        } finally {
            setIsGeneratingImage(false);
        }
    }, [isGeneratingImage, t, getSafeVersionIndex, normalizeAIError, onIncrementUsage, onNotify]);

    return {
        AGENT_STATES,
        agentState,
        errorMessage,
        versions,
        currentVersionIndex,
        setCurrentVersionIndex,
        agentSteps,
        isGenerating,
        isIterating,
        isGeneratingImage,
        isWorking,
        displayedText,
        setDisplayedText,
        setVersions,
        setAgentState,
        setErrorMessage,
        setAgentSteps,
        startGeneration,
        handleGenerateImage,
        cancelCurrentGeneration,
        getSafeVersionIndex
    };
}
