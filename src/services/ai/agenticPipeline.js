import { analyzeImage, generateImage, sendToAI } from './index.js';
import { resolveModel } from '../models/index.js';
import {
    IMAGE_AGENT_TOOL_DEFINITIONS,
    getImageAgentTools,
    normalizeToolCalls,
    parseFallbackToolCommands,
    toolDefinitionsToPrompt
} from './toolDefinitions.js';
import { executeAgentTool } from './toolRuntime.js';
import { saveImageArtifact } from '../imageArtifacts.js';
import { getLocalSaveSettings } from '../filePersistence.js';
import { buildBrandContextText, getBrandKitAssetIds } from '../brandKit.js';
import { getMedia } from '../mediaService.js';

const ALLOWED_STEP_TYPES = new Set(['text', 'chat', 'image', 'analyze']);
const IMAGE_TOOL_NAMES = new Set(['generate_image', 'edit_image', 'create_image_variation', 'openrouter:image_generation']);

const VISUAL_REFUSAL_PATTERN = /(no puedo (generar|crear|guardar|acceder)|no tengo la capacidad|soy un modelo de lenguaje|modelo basado en texto|i cannot (generate|create|save|access)|i'm a text-based|text-based assistant|use (midjourney|dall-e|stable diffusion|bing image creator)|usa (midjourney|dall-e|stable diffusion|bing image creator))/i;

const cleanTextResults = (results, hasGeneratedImage, t) => {
    const usableResults = results
        .map((result) => String(result || '').trim())
        .filter(Boolean)
        .filter((result) => !(hasGeneratedImage && VISUAL_REFUSAL_PATTERN.test(result)));

    if (usableResults.length > 0) return usableResults.join('\n\n');
    if (hasGeneratedImage) return t('agentic.visualStepComplete');
    return '';
};

const getPendingSaves = (results) => results
    .filter((item) => item.result?.status === 'approval-required')
    .map((item) => ({
        assetId: item.result.assetId,
        filename: item.result.filename,
        status: item.result.status
    }));

const looksLikeVisualRequest = (prompt, hasReference) => {
    if (hasReference) return true;
    return /(image|imagen|photo|foto|thumbnail|poster|cover|banner|visual|design|diseno|logo|illustration|ilustracion|render|mockup)/i.test(prompt);
};

const normalizePlan = (content, prompt, shouldGenerateImage) => {
    let parsed = null;
    try {
        const cleaned = String(content || '').replace(/```json|```/gi, '').trim();
        parsed = JSON.parse(cleaned);
    } catch {
        parsed = null;
    }

    const planSource = Array.isArray(parsed) ? parsed : parsed?.plan;
    let plan = Array.isArray(planSource)
        ? planSource
            .filter((step) => step && ALLOWED_STEP_TYPES.has(step.type))
            .map((step) => ({
                type: step.type,
                description: String(step.description || step.prompt || '').trim(),
                prompt: String(step.prompt || step.description || prompt).trim(),
                systemPrompt: step.systemPrompt
            }))
        : [];

    if (plan.length === 0) {
        plan = [{ type: 'text', description: prompt, prompt }];
    }

    if (shouldGenerateImage && !plan.some((step) => step.type === 'image')) {
        plan.push({
            type: 'image',
            description: 'Generate the requested visual',
            prompt: prompt
        });
    }

    return plan;
};

const getContext = (text, analyses, images) => {
    const sections = [];
    if (text) sections.push(`TEXT RESULTS:\n${text.slice(-4000)}`);
    if (analyses) sections.push(`IMAGE ANALYSIS:\n${analyses.slice(-3000)}`);
    if (images.length > 0) sections.push(`GENERATED VISUALS: ${images.map((image) => image.prompt).join(' | ')}`);
    return sections.join('\n\n');
};

export async function executeAgenticPipeline({
    prompt,
    selectedTextModel,
    selectedImageModel,
    visionModel,
    imageConfig = {},
    sourceImages = [],
    t,
    signal,
    onSteps,
    onChunk,
    projectId = null,
    projectName = 'opencontent',
    version = 1,
    settings = getLocalSaveSettings(),
    imageCount: initialImageCount = 0,
    imageLimit = null,
    skipImagesWhenLimitReached = false,
    preferNativeTools = true,
    preferOpenRouterImageTool = false,
    onArtifact,
    brandContext = buildBrandContextText(),
    brandAssetIds = getBrandKitAssetIds(),
    hasVisualReference
}) {
    const configuredBrandAssets = await Promise.all(brandAssetIds.map((assetId) => getMedia(assetId).catch(() => null)));
    sourceImages = [...sourceImages, ...configuredBrandAssets.map((asset) => asset?.data).filter(Boolean)]
        .filter((value, index, values) => values.indexOf(value) === index);
    const shouldGenerateImage = looksLikeVisualRequest(prompt, Boolean(hasVisualReference || sourceImages.length > 0));
    const contextualPrompt = brandContext ? `${brandContext}\n\nUSER TASK:\n${prompt}` : prompt;
    const textModel = resolveModel(selectedTextModel);
    const nativeToolsAvailable = Boolean(preferNativeTools && textModel.capabilities?.toolCalling);
    const nativeTools = getImageAgentTools({
        includeOpenRouterServerTool: preferOpenRouterImageTool && textModel.provider === 'openrouter'
    });
    let activeImageConfig = { ...imageConfig };
    let imageCount = initialImageCount;
    const maxImages = imageLimit ?? (settings?.allowMultipleImages === false
        ? 1
        : Math.max(1, Math.min(12, Number(settings?.maxImagesPerTask) || 4)));

    const executeToolCalls = async (calls) => {
        const results = [];
        for (const call of calls) {
            if (skipImagesWhenLimitReached && imageCount >= maxImages && IMAGE_TOOL_NAMES.has(call.name)) {
                results.push({ name: call.name, call, result: { status: 'image-limit-reached' } });
                continue;
            }
            const callArguments = call.name === 'generate_image' && brandAssetIds.length > 0 && !call.arguments?.sourceAssetIds?.length
                ? { ...call.arguments, sourceAssetIds: brandAssetIds }
                : call.arguments;
            const result = await executeAgentTool(call.name, callArguments, {
                selectedImageModel,
                visionModel,
                imageConfig: activeImageConfig,
                projectId,
                projectName,
                version,
                settings,
                sourceImages,
                signal,
                imageCount,
                imageLimit,
                onArtifact
            });
            if (result?.imageConfig) activeImageConfig = result.imageConfig;
            imageCount += result?.assets?.length || (result?.imageUrl ? 1 : 0);
            results.push({ name: call.name, call, result });
        }
        return results;
    };

    if (nativeToolsAvailable) {
        onSteps([{ id: 'tool-turn', text: t('agentic.toolPlanning'), status: 'working' }]);
        let toolResponse = await sendToAI(contextualPrompt, selectedTextModel, {
            systemPrompt: `${t('agentic.executorPrompt')}\n${brandContext}\n${toolDefinitionsToPrompt(nativeTools)}`,
            tools: nativeTools,
            toolChoice: 'auto',
            parallelToolCalls: false,
            imageUrls: sourceImages,
            signal
        });
        const toolCalls = [];
        const toolResults = [];
        for (let turn = 0; turn < 4; turn += 1) {
            if (toolResponse.imageUrl) {
                if (imageCount >= maxImages) {
                    if (!skipImagesWhenLimitReached) throw new Error('IMAGE_TASK_LIMIT_REACHED');
                    toolResults.push({ name: 'openrouter:image_generation', result: { status: 'image-limit-reached' } });
                } else {
                    const artifact = await saveImageArtifact(toolResponse.imageUrl, {
                        projectId,
                        projectName,
                        version,
                        kind: 'generated',
                        model: selectedImageModel,
                        prompt,
                        settings
                    });
                    onArtifact?.(artifact.asset);
                    toolResults.push({ name: 'openrouter:image_generation', result: { imageUrl: artifact.asset.data, assetId: artifact.asset.id, prompt } });
                    imageCount += 1;
                }
            }

            const nativeCalls = normalizeToolCalls(toolResponse.toolCalls || []);
            const fallbackCalls = nativeCalls.length === 0
                ? normalizeToolCalls(parseFallbackToolCommands(toolResponse.content))
                : [];
            const calls = nativeCalls.length > 0 ? nativeCalls : fallbackCalls;
            if (calls.length === 0) break;

            toolCalls.push(...calls);
            const executedResults = await executeToolCalls(calls);
            toolResults.push(...executedResults);
            onSteps([{ id: 'tool-turn', text: t('agentic.toolComplete'), status: 'completed' }]);
            toolResponse = await sendToAI(
                contextualPrompt,
                selectedTextModel,
                {
                    systemPrompt: `${t('agentic.executorPrompt')}\n${brandContext}\n${toolDefinitionsToPrompt(nativeTools)}`,
                    tools: nativeTools,
                    toolChoice: 'auto',
                    parallelToolCalls: false,
                    toolContext: {
                        assistantMessage: toolResponse.assistantMessage,
                        calls,
                        results: executedResults
                    },
                    signal
                }
            );
        }

        if (toolResults.length > 0) {
            const generatedToolImages = toolResults.flatMap((item) => item.result?.imageUrl ? [item.result.imageUrl] : []);
            return {
                plan: toolCalls.map((call) => ({ type: 'tool', description: call.name, prompt: call.arguments?.prompt || '' })),
                text: toolResponse.success && toolResponse.content
                    ? toolResponse.content
                    : cleanTextResults([], generatedToolImages.length > 0, t),
                analysis: toolResults.find((item) => item.result?.analysis)?.result.analysis || '',
                images: toolResults.flatMap((item) => item.result?.assetId ? [{ url: item.result.imageUrl, prompt: item.result?.prompt || item.name, assetId: item.result.assetId }] : []),
                imageUrl: generatedToolImages[0] || null,
                imagePrompt: toolCalls.find((call) => call.name === 'generate_image')?.arguments?.prompt || '',
                pendingSaves: getPendingSaves(toolResults),
                model: selectedTextModel,
                imageModel: selectedImageModel
            };
        }
    }

    const plannerResponse = await sendToAI(contextualPrompt, selectedTextModel, {
            systemPrompt: `${t('agentic.plannerPrompt')}\n${brandContext}\n${toolDefinitionsToPrompt(IMAGE_AGENT_TOOL_DEFINITIONS, { fallback: true })}`,
        signal,
        maxTokens: 2000
    });

    if (!plannerResponse.success) {
        throw new Error(plannerResponse.error || 'AGENTIC_PLANNER_FAILED');
    }

    const fallbackActions = parseFallbackToolCommands(plannerResponse.content);
    if (fallbackActions.length > 0) {
        const fallbackResults = [];
        onSteps(fallbackActions.map((action, index) => ({
            id: `fallback-tool-${index}`,
            text: action.name || action.tool,
            status: 'working'
        })));
        for (const action of fallbackActions) {
            const actionName = action.name || action.tool;
            const actionArguments = action.arguments || action.parameters || {};
            const result = skipImagesWhenLimitReached && imageCount >= maxImages && IMAGE_TOOL_NAMES.has(actionName)
                ? { status: 'image-limit-reached' }
                : await executeAgentTool(actionName, actionName === 'generate_image' && brandAssetIds.length > 0 && !actionArguments.sourceAssetIds?.length
                    ? { ...actionArguments, sourceAssetIds: brandAssetIds }
                    : actionArguments, {
                    selectedImageModel,
                    visionModel,
                    imageConfig: activeImageConfig,
                    projectId,
                    projectName,
                    version,
                    settings,
                    sourceImages,
                    signal,
                    imageCount,
                    imageLimit,
                    onArtifact
                });
            if (result?.imageConfig) activeImageConfig = result.imageConfig;
            imageCount += result?.assets?.length || (result?.imageUrl ? 1 : 0);
            fallbackResults.push({ name: actionName, call: { name: actionName, arguments: action.arguments || action.parameters || {} }, result });
        }
        const imageResult = fallbackResults.find((item) => item.result?.imageUrl);
        const analysisResult = fallbackResults.find((item) => item.result?.analysis);
        const finalResponse = await sendToAI(
            `${contextualPrompt}\n\nAPPLICATION TOOL RESULTS:\n${JSON.stringify(fallbackResults)}\n\nRespond with a concise final answer based on the completed operations. Do not claim that you cannot generate, save, or access images.`,
            selectedTextModel,
            { systemPrompt: `${t('agentic.executorPrompt')}\n${brandContext}`, signal }
        );
        return {
            plan: fallbackActions.map((action) => ({ type: 'tool', description: action.name || action.tool, prompt: action.arguments?.prompt || '' })),
            text: finalResponse.success && finalResponse.content
                ? finalResponse.content
                : analysisResult?.result?.analysis || cleanTextResults([], Boolean(imageResult), t),
            analysis: analysisResult?.result?.analysis || '',
            images: fallbackResults.filter((item) => item.result?.assetId).map((item) => ({
                assetId: item.result.assetId,
                url: item.result.imageUrl,
                prompt: item.result.prompt || item.name
            })),
            imageUrl: imageResult?.result?.imageUrl || null,
            imagePrompt: fallbackActions.find((action) => (action.name || action.tool) === 'generate_image')?.arguments?.prompt || '',
            pendingSaves: getPendingSaves(fallbackResults),
            model: selectedTextModel,
            imageModel: selectedImageModel
        };
    }

    const plan = normalizePlan(plannerResponse.content, prompt, shouldGenerateImage);
    onSteps(plan.map((step, index) => ({
        id: `agentic-${index}`,
        text: step.description || step.prompt,
        status: 'waiting'
    })));

    const textResults = [];
    let accumulatedAnalysis = '';
    const generatedImages = [];

    const updateStep = (index, status, text) => {
        onSteps((current) => current.map((step, stepIndex) => (
            stepIndex === index
                ? { ...step, status, ...(text ? { text } : {}) }
                : step
        )));
    };

    for (let index = 0; index < plan.length; index += 1) {
        if (signal?.aborted) throw new Error('REQUEST_ABORTED');
        const step = plan[index];
        updateStep(index, 'working');

        if (step.type === 'text' || step.type === 'chat') {
            const context = getContext(textResults.join('\n\n'), accumulatedAnalysis, generatedImages);
            const taskPrompt = context
                ? `${context}\n\nCURRENT TASK:\n${step.prompt}`
                : step.prompt;
            const contextualTaskPrompt = brandContext ? `${brandContext}\n\n${taskPrompt}` : taskPrompt;
            const result = await sendToAI(contextualTaskPrompt, selectedTextModel, {
                systemPrompt: `${step.systemPrompt || t('agentic.executorPrompt')}\n${brandContext}`,
                signal,
                stream: true,
                onChunk: (_chunk, accumulated) => onChunk?.(accumulated)
            });
            if (!result.success) throw new Error(result.error || 'AGENTIC_TEXT_STEP_FAILED');
            textResults.push(result.content);
            onChunk?.(result.content);
        } else if (step.type === 'analyze') {
            const imageUrl = generatedImages.at(-1)?.url || sourceImages[0];
            if (!imageUrl || !visionModel) {
                accumulatedAnalysis += `${accumulatedAnalysis ? '\n\n' : ''}${t('agentic.noImageForAnalysis')}`;
            } else {
                const result = await analyzeImage(imageUrl, brandContext ? `${brandContext}\n\n${step.prompt}` : step.prompt, {
                    signal,
                    visionModel: visionModel || selectedTextModel
                });
                if (!result.success) throw new Error(result.error || 'AGENTIC_ANALYSIS_STEP_FAILED');
                accumulatedAnalysis += `${accumulatedAnalysis ? '\n\n' : ''}${result.analysis}`;
            }
        } else if (step.type === 'image') {
            if (!selectedImageModel) throw new Error('IMAGE_MODEL_NOT_SELECTED');
            if (imageCount >= maxImages) {
                if (!skipImagesWhenLimitReached) throw new Error('IMAGE_TASK_LIMIT_REACHED');
                updateStep(index, 'completed');
                continue;
            }
            const imagePrompt = brandContext ? `${brandContext}\n\nVISUAL TASK:\n${step.prompt}` : step.prompt;
            const result = await generateImage(imagePrompt, selectedImageModel, {
                ...activeImageConfig,
                signal,
                imageUrl: sourceImages[0] || null,
                imageUrls: sourceImages
            });
            if (!result.success) throw new Error(result.error || 'IMAGE_GENERATION_FAILED');

            const artifact = await saveImageArtifact(result.imageUrl, {
                projectId,
                projectName,
                version,
                kind: 'generated',
                model: result.model,
                prompt: imagePrompt,
                parameters: activeImageConfig,
                referenceAssetIds: brandAssetIds,
                settings,
                persistExternally: false
            });
            const imageArtifact = {
                prompt: imagePrompt,
                url: artifact.asset.data,
                assetId: artifact.asset.id,
                model: result.model,
                step: index
            };
            generatedImages.push(imageArtifact);
            imageCount += 1;
            onArtifact?.(artifact.asset);
        }

        updateStep(index, 'completed');
    }

    return {
        plan,
        text: cleanTextResults(textResults, generatedImages.length > 0, t) || t('workspace.visualGeneratedNoText'),
        analysis: accumulatedAnalysis,
        images: generatedImages,
        imageUrl: generatedImages.at(-1)?.url || null,
        imagePrompt: generatedImages.at(-1)?.prompt || '',
        pendingSaves: [],
        model: selectedTextModel,
        imageModel: generatedImages.at(-1)?.model || selectedImageModel
    };
}

export async function executeAgenticBatch({
    count,
    version = 1,
    signal,
    promptForVariation,
    onBeforeVariation,
    onProgress,
    onSteps,
    onVariationComplete,
    ...pipelineOptions
}) {
    const total = Math.max(0, Number(count) || 0);
    const results = [];
    const settings = pipelineOptions.settings || getLocalSaveSettings();
    const imageLimit = settings?.allowMultipleImages === false
        ? 1
        : Math.max(1, Math.min(12, Number(settings?.maxImagesPerTask) || 4));
    let imageCount = 0;

    for (let index = 0; index < total; index += 1) {
        if (signal?.aborted) throw new Error('REQUEST_ABORTED');

        const current = index + 1;
        const allowed = await onBeforeVariation?.({ index, current, total });
        if (allowed === false) {
            return { results, stopped: true, completed: results.length, total };
        }

        onProgress?.({ index, current, total, status: 'working' });
        let variationSteps = [];
        const result = await executeAgenticPipeline({
            ...pipelineOptions,
            prompt: promptForVariation ? promptForVariation({ index, current, total }) : pipelineOptions.prompt,
            version: version + index,
            imageCount,
            imageLimit,
            skipImagesWhenLimitReached: true,
            signal,
            onSteps: (nextSteps) => {
                variationSteps = typeof nextSteps === 'function'
                    ? nextSteps(variationSteps)
                    : nextSteps;
                onSteps?.(variationSteps, { index, current, total });
            }
        });

        results.push(result);
        imageCount += result.images?.length || 0;
        await onVariationComplete?.(result, { index, current, total });
        onProgress?.({ index, current, total, status: 'completed' });
    }

    return { results, stopped: false, completed: results.length, total };
}

export { looksLikeVisualRequest, normalizePlan };
