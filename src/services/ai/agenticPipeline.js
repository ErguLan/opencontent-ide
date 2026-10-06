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

/**
 * Canonical step status vocabulary emitted through `onSteps`.
 *
 * waiting   the step is queued and has not started yet
 * working   the step is currently running
 * completed the step finished and produced its intended output
 * failed    the step could not finish; the run continues and the error is
 *           reported in `failures`
 * skipped   the step was intentionally not executed (limit reached, missing
 *           image model, nothing to analyze). Not an error.
 *
 * Consumers must import these constants instead of hardcoding the strings.
 */
export const AGENTIC_STEP_STATUS = Object.freeze({
    WAITING: 'waiting',
    WORKING: 'working',
    COMPLETED: 'completed',
    FAILED: 'failed',
    SKIPPED: 'skipped'
});

export const AGENTIC_STEP_STATUSES = Object.freeze([
    AGENTIC_STEP_STATUS.WAITING,
    AGENTIC_STEP_STATUS.WORKING,
    AGENTIC_STEP_STATUS.COMPLETED,
    AGENTIC_STEP_STATUS.FAILED,
    AGENTIC_STEP_STATUS.SKIPPED
]);

export const AGENTIC_ABORT_CODE = 'REQUEST_ABORTED';
export const AGENTIC_IMAGE_LIMIT_CODE = 'IMAGE_TASK_LIMIT_REACHED';
export const AGENTIC_IMAGE_LIMIT_STATUS = 'image-limit-reached';

const ALLOWED_STEP_TYPES = new Set(['text', 'chat', 'image', 'analyze']);
const IMAGE_TOOL_NAMES = new Set(['generate_image', 'edit_image', 'create_image_variation', 'openrouter:image_generation']);
const IMAGE_FAILURE_CODES = new Set([
    'IMAGE_GENERATION_FAILED',
    'IMAGE_ANALYSIS_FAILED',
    'IMAGE_ARTIFACT_NOT_FOUND',
    'IMAGE_MODEL_NOT_SELECTED',
    'AGENTIC_IMAGE_STEP_FAILED'
]);

const VISUAL_REFUSAL_PATTERN = /(no puedo (generar|crear|guardar|acceder)|no tengo la capacidad|soy un modelo de lenguaje|modelo basado en texto|i cannot (generate|create|save|access)|i'm a text-based|text-based assistant|use (midjourney|dall-e|stable diffusion|bing image creator)|usa (midjourney|dall-e|stable diffusion|bing image creator))/i;

const FAILURE_MESSAGE_KEYS = Object.freeze({
    REQUEST_ABORTED: 'agentic.failures.requestAborted',
    AGENTIC_PLANNER_FAILED: 'agentic.failures.plannerFailed',
    AGENTIC_TEXT_STEP_FAILED: 'agentic.failures.textStepFailed',
    AGENTIC_CHAT_STEP_FAILED: 'agentic.failures.textStepFailed',
    AGENTIC_ANALYSIS_STEP_FAILED: 'agentic.failures.analysisStepFailed',
    AGENTIC_TOOL_FAILED: 'agentic.failures.toolFailed',
    AGENTIC_IMAGE_STEP_FAILED: 'agentic.failures.imageStepFailed',
    IMAGE_GENERATION_FAILED: 'agentic.failures.imageGenerationFailed',
    IMAGE_ANALYSIS_FAILED: 'agentic.failures.imageAnalysisFailed',
    IMAGE_ARTIFACT_NOT_FOUND: 'agentic.failures.artifactNotFound',
    IMAGE_MODEL_NOT_SELECTED: 'agentic.failures.imageModelNotSelected',
    IMAGE_TASK_LIMIT_REACHED: 'agentic.failures.imageLimitReached',
    UNKNOWN_AGENT_TOOL: 'agentic.failures.unknownTool'
});

const isAbortError = (error) => {
    const message = String(error?.message || error || '');
    return message.includes(AGENTIC_ABORT_CODE) || message.includes('ABORT_ERR');
};

const normalizeFailureCode = (error, fallbackCode) => {
    const raw = String(error?.message || error || '').trim();
    const head = raw.split(':')[0].trim();
    return /^[A-Z][A-Z0-9_]*$/.test(head) ? head : fallbackCode;
};

const extractFailureDetail = (error, code) => {
    const raw = String(error?.message || error || '').trim();
    if (!raw) return '';
    const head = raw.split(':')[0].trim();
    if (head !== code) return '';
    return raw.slice(head.length).replace(/^:\s*/, '').trim();
};

const isRetryableFailure = (name, code) => IMAGE_TOOL_NAMES.has(name) || IMAGE_FAILURE_CODES.has(code);

/**
 * An HTTP rejection from the provider is not an unknown failure: the provider
 * said exactly what it disliked, usually naming the endpoint or the model. It
 * gets its own message instead of being reported as "unexpected".
 */
const isProviderHttpCode = (code) => /^PROVIDER_HTTP_\d{3}$/.test(code);

const resolveFailureMessage = (code, detail, t) => {
    const known = FAILURE_MESSAGE_KEYS[code];
    const base = known
        ? t(known, { code })
        : isProviderHttpCode(code)
            ? t('agentic.failures.providerRejected')
            : t('agentic.failures.unexpected', { code });
    if (!detail) return base;
    return isProviderHttpCode(code)
        ? t('agentic.failureWithProviderDetail', { message: base, detail })
        : t('agentic.failureWithDetail', { message: base, detail });
};

const createFailureRecorder = (t) => {
    const failures = [];
    const record = ({ stepId, name, error, fallbackCode }) => {
        const code = normalizeFailureCode(error, fallbackCode);
        const detail = extractFailureDetail(error, code);
const message = resolveFailureMessage(code, detail, t);
        const failure = {
            stepId,
            name,
            code,
            message,
            retryable: isRetryableFailure(name, code)
        };
        failures.push(failure);
        return failure;
    };
    return { failures, record };
};

const isVisualRefusal = (value) => VISUAL_REFUSAL_PATTERN.test(String(value || ''));

const cleanTextResults = (results, hasGeneratedImage, t) => {
    const normalizedResults = results
        .map((result) => String(result || '').trim())
        .filter(Boolean);
    const usableResults = normalizedResults.filter((result) => !(hasGeneratedImage && isVisualRefusal(result)));

    if (usableResults.length > 0) return usableResults.join('\n\n');
    if (hasGeneratedImage) return t('agentic.visualStepComplete');
    if (normalizedResults.length > 0) return t('agentic.noOutputNotice');
    return '';
};

const buildFinalText = ({ candidates, hasGeneratedImage, failures, t, fallback = '' }) => {
    const base = cleanTextResults(candidates, hasGeneratedImage, t) || fallback;
    if (failures.length === 0) return base;
    const notice = t('agentic.partialFailureNotice', { count: failures.length });
    return base ? `${base}\n\n${notice}` : notice;
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

/**
 * The returned `plan` is stored on the produced version and rendered by the
 * artifact timeline, so it must describe what happened, not only what was
 * attempted. Tool strategies have no parsed plan: they rebuild one from the
 * records the run executed, pairing each record with the step the emitter
 * published, which already carries the real status and the real text.
 */
const buildToolPlan = (records, publishedSteps) => records.map((record) => {
    const published = publishedSteps.find((step) => step.id === record.stepId) || {};
    return {
        id: record.stepId,
        type: 'tool',
        description: record.name,
        prompt: String(record.call?.arguments?.prompt || ''),
        status: AGENTIC_STEP_STATUSES.includes(published.status)
            ? published.status
            : AGENTIC_STEP_STATUS.WAITING,
        text: published.text || record.name
    };
});

const buildPipelineResult = ({
    plan,
    text,
    analysis,
    images,
    imageUrl,
    imagePrompt,
    pendingSaves,
    model,
    imageModel,
    failures
}) => {
    const producedOutput = Boolean(String(text || '').trim() || analysis || images.length > 0);
    return {
        plan,
        text,
        analysis,
        images,
        imageUrl,
        imagePrompt,
        pendingSaves,
        model,
        imageModel,
        failures,
        partial: failures.length > 0 && producedOutput,
        retryable: failures.some((failure) => failure.retryable)
    };
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

    const { failures, record: recordFailure } = createFailureRecorder(t);

    // Tool-driven strategies emit one flat list. The emitter keeps the list and
    // re-publishes it whole, so the UI never loses earlier tool steps.
    const createStepEmitter = () => {
        const steps = [];
        const publish = (id, status, text) => {
            const existingIndex = steps.findIndex((step) => step.id === id);
            const nextStep = { id, status, ...(text ? { text } : {}) };
            if (existingIndex >= 0) steps[existingIndex] = { ...steps[existingIndex], ...nextStep };
            else steps.push(nextStep);
            onSteps(steps.map((step) => ({ ...step })));
        };
        return { steps, publish };
    };

    const toolSteps = createStepEmitter();

    const toolContext = () => ({
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
    const withBrandAssets = (name, args) => (name === 'generate_image' && brandAssetIds.length > 0 && !args?.sourceAssetIds?.length
        ? { ...args, sourceAssetIds: brandAssetIds }
        : args);
    const imageLimitReachedFor = (name) => IMAGE_TOOL_NAMES.has(name) && imageCount >= maxImages;

    const registerToolResult = (name, call, stepId, result) => {
        if (result?.imageConfig) activeImageConfig = result.imageConfig;
        imageCount += result?.assets?.length || (result?.imageUrl ? 1 : 0);
        return { name, call, stepId, result };
    };

    const runToolCall = async (call, stepId) => {
        if (imageLimitReachedFor(call.name)) {
            toolSteps.publish(stepId, AGENTIC_STEP_STATUS.SKIPPED, t('agentic.imageStepLimitReached'));
            return registerToolResult(call.name, call, stepId, { status: AGENTIC_IMAGE_LIMIT_STATUS });
        }
        toolSteps.publish(stepId, AGENTIC_STEP_STATUS.WORKING, call.name);
        try {
            const result = await executeAgentTool(call.name, withBrandAssets(call.name, call.arguments), toolContext());
            toolSteps.publish(stepId, AGENTIC_STEP_STATUS.COMPLETED, call.name);
            return registerToolResult(call.name, call, stepId, result);
        } catch (error) {
            if (isAbortError(error)) throw error;
            if (normalizeFailureCode(error, AGENTIC_ABORT_CODE) === AGENTIC_IMAGE_LIMIT_CODE) {
                toolSteps.publish(stepId, AGENTIC_STEP_STATUS.SKIPPED, t('agentic.imageStepLimitReached'));
                return registerToolResult(call.name, call, stepId, { status: AGENTIC_IMAGE_LIMIT_STATUS });
            }
            const failure = recordFailure({ stepId, name: call.name, error, fallbackCode: 'AGENTIC_TOOL_FAILED' });
            toolSteps.publish(stepId, AGENTIC_STEP_STATUS.FAILED, failure.message);
            return registerToolResult(call.name, call, stepId, { status: 'failed', error: failure.message });
        }
    };

    const executeToolCalls = async (calls) => {
        const results = [];
        for (let index = 0; index < calls.length; index += 1) {
            const call = calls[index];
            if (signal?.aborted) throw new Error(AGENTIC_ABORT_CODE);
            results.push(await runToolCall(call, `tool-call-${call.id || index}`));
        }
        return results;
    };

    if (nativeToolsAvailable) {
        toolSteps.publish('tool-turn', AGENTIC_STEP_STATUS.WORKING, t('agentic.toolPlanning'));
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
                const stepId = 'tool-call-openrouter:image_generation';
                if (imageLimitReachedFor('openrouter:image_generation')) {
                    toolSteps.publish(stepId, AGENTIC_STEP_STATUS.SKIPPED, t('agentic.imageStepLimitReached'));
                    toolResults.push(registerToolResult(
                        'openrouter:image_generation',
                        { name: 'openrouter:image_generation', arguments: {} },
                        stepId,
                        { status: AGENTIC_IMAGE_LIMIT_STATUS }
                    ));
                } else {
                    toolSteps.publish(stepId, AGENTIC_STEP_STATUS.WORKING, 'openrouter:image_generation');
                    try {
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
                        toolSteps.publish(stepId, AGENTIC_STEP_STATUS.COMPLETED, 'openrouter:image_generation');
                        toolResults.push(registerToolResult(
                            'openrouter:image_generation',
                            { name: 'openrouter:image_generation', arguments: {} },
                            stepId,
                            { imageUrl: artifact.asset.data, assetId: artifact.asset.id, prompt }
                        ));
                    } catch (error) {
                        if (isAbortError(error)) throw error;
                        const failure = recordFailure({
                            stepId,
                            name: 'openrouter:image_generation',
                            error,
                            fallbackCode: 'AGENTIC_IMAGE_STEP_FAILED'
                        });
                        toolSteps.publish(stepId, AGENTIC_STEP_STATUS.FAILED, failure.message);
                        toolResults.push(registerToolResult(
                            'openrouter:image_generation',
                            { name: 'openrouter:image_generation', arguments: {} },
                            stepId,
                            { status: 'failed', error: failure.message }
                        ));
                    }
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
            toolSteps.publish('tool-turn', AGENTIC_STEP_STATUS.COMPLETED, t('agentic.toolComplete'));
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
            return buildPipelineResult({
                plan: buildToolPlan(toolResults, toolSteps.steps),
                text: buildFinalText({
                    candidates: toolResponse.success ? [toolResponse.content] : [],
                    hasGeneratedImage: generatedToolImages.length > 0,
                    failures,
                    t
                }),
                analysis: toolResults.find((item) => item.result?.analysis)?.result.analysis || '',
                images: toolResults.flatMap((item) => item.result?.assetId ? [{ url: item.result.imageUrl, prompt: item.result?.prompt || item.name, assetId: item.result.assetId }] : []),
                imageUrl: generatedToolImages[0] || null,
                imagePrompt: toolCalls.find((call) => call.name === 'generate_image')?.arguments?.prompt || '',
                pendingSaves: getPendingSaves(toolResults),
                model: selectedTextModel,
                imageModel: selectedImageModel,
                failures
            });
        }
    }

    const plannerResponse = await sendToAI(contextualPrompt, selectedTextModel, {
        systemPrompt: `${t('agentic.plannerPrompt')}\n${brandContext}\n${toolDefinitionsToPrompt(IMAGE_AGENT_TOOL_DEFINITIONS, { fallback: true })}`,
        signal,
        maxTokens: 2000
    });

    if (!plannerResponse.success) {
        const error = new Error(plannerResponse.error || 'AGENTIC_PLANNER_FAILED');
        recordFailure({ stepId: 'agentic-planner', name: 'planner', error, fallbackCode: 'AGENTIC_PLANNER_FAILED' });
        toolSteps.publish('agentic-planner', AGENTIC_STEP_STATUS.FAILED, t(FAILURE_MESSAGE_KEYS.AGENTIC_PLANNER_FAILED));
        throw error;
    }

    const fallbackActions = parseFallbackToolCommands(plannerResponse.content);
    if (fallbackActions.length > 0) {
        const fallbackResults = [];
        for (let index = 0; index < fallbackActions.length; index += 1) {
            const action = fallbackActions[index];
            const actionName = action.name || action.tool;
            const actionArguments = action.arguments || action.parameters || {};
            const stepId = `fallback-tool-${index}`;
            const call = { name: actionName, arguments: actionArguments };
            if (signal?.aborted) throw new Error(AGENTIC_ABORT_CODE);
            toolSteps.publish(stepId, AGENTIC_STEP_STATUS.WORKING, actionName);
            if (imageLimitReachedFor(actionName)) {
                toolSteps.publish(stepId, AGENTIC_STEP_STATUS.SKIPPED, t('agentic.imageStepLimitReached'));
                fallbackResults.push(registerToolResult(actionName, call, stepId, { status: AGENTIC_IMAGE_LIMIT_STATUS }));
                continue;
            }
            try {
                const result = await executeAgentTool(actionName, withBrandAssets(actionName, actionArguments), toolContext());
                toolSteps.publish(stepId, AGENTIC_STEP_STATUS.COMPLETED, actionName);
                fallbackResults.push(registerToolResult(actionName, call, stepId, result));
            } catch (error) {
                if (isAbortError(error)) throw error;
                if (normalizeFailureCode(error, AGENTIC_ABORT_CODE) === AGENTIC_IMAGE_LIMIT_CODE) {
                    toolSteps.publish(stepId, AGENTIC_STEP_STATUS.SKIPPED, t('agentic.imageStepLimitReached'));
                    fallbackResults.push(registerToolResult(actionName, call, stepId, { status: AGENTIC_IMAGE_LIMIT_STATUS }));
                    continue;
                }
                const failure = recordFailure({ stepId, name: actionName, error, fallbackCode: 'AGENTIC_TOOL_FAILED' });
                toolSteps.publish(stepId, AGENTIC_STEP_STATUS.FAILED, failure.message);
                fallbackResults.push(registerToolResult(actionName, call, stepId, { status: 'failed', error: failure.message }));
            }
        }
        const imageResult = fallbackResults.find((item) => item.result?.imageUrl);
        const analysisResult = fallbackResults.find((item) => item.result?.analysis);
        const finalResponse = await sendToAI(
            `${contextualPrompt}\n\nAPPLICATION TOOL RESULTS:\n${JSON.stringify(fallbackResults)}\n\nRespond with a concise final answer based on the completed operations. Do not claim that you cannot generate, save, or access images.`,
            selectedTextModel,
            { systemPrompt: `${t('agentic.executorPrompt')}\n${brandContext}`, signal }
        );
        const textCandidates = finalResponse.success && finalResponse.content
            ? [finalResponse.content]
            : [analysisResult?.result?.analysis || ''];
        return buildPipelineResult({
            plan: buildToolPlan(fallbackResults, toolSteps.steps),
            text: buildFinalText({
                candidates: textCandidates,
                hasGeneratedImage: Boolean(imageResult),
                failures,
                t
            }),
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
            imageModel: selectedImageModel,
            failures
        });
    }

    const plan = normalizePlan(plannerResponse.content, prompt, shouldGenerateImage)
        .map((step, index) => ({
            id: `agentic-${index}`,
            ...step,
            status: AGENTIC_STEP_STATUS.WAITING,
            text: step.description || step.prompt
        }));
    onSteps(plan.map((step) => ({
        id: step.id,
        text: step.text,
        status: step.status
    })));

    const textResults = [];
    let accumulatedAnalysis = '';
    const generatedImages = [];

    // The plan is the record the version keeps, so it settles with the step it
    // describes. A step that could not finish keeps the translated failure text
    // the pipeline already produced; a cancellation never reaches this path.
    const updateStep = (index, status, text) => {
        if (plan[index]) {
            plan[index] = { ...plan[index], status, ...(text ? { text } : {}) };
        }
        onSteps((current) => current.map((step, stepIndex) => (
            stepIndex === index
                ? { ...step, status, ...(text ? { text } : {}) }
                : step
        )));
    };

    const runTextStep = async (step) => {
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
        return { status: AGENTIC_STEP_STATUS.COMPLETED };
    };

    const runAnalyzeStep = async (step) => {
        const imageUrl = generatedImages.at(-1)?.url || sourceImages[0];
        if (!imageUrl || !visionModel) {
            accumulatedAnalysis += `${accumulatedAnalysis ? '\n\n' : ''}${t('agentic.noImageForAnalysis')}`;
            return { status: AGENTIC_STEP_STATUS.SKIPPED, text: t('agentic.noImageForAnalysis') };
        }
        const result = await analyzeImage(imageUrl, brandContext ? `${brandContext}\n\n${step.prompt}` : step.prompt, {
            signal,
            visionModel: visionModel || selectedTextModel
        });
        if (!result.success) throw new Error(result.error || 'AGENTIC_ANALYSIS_STEP_FAILED');
        accumulatedAnalysis += `${accumulatedAnalysis ? '\n\n' : ''}${result.analysis}`;
        return { status: AGENTIC_STEP_STATUS.COMPLETED };
    };

    const runImageStep = async (step, index) => {
        if (!selectedImageModel) {
            return { status: AGENTIC_STEP_STATUS.SKIPPED, text: t('agentic.imageStepModelMissing') };
        }
        if (imageCount >= maxImages) {
            return { status: AGENTIC_STEP_STATUS.SKIPPED, text: t('agentic.imageStepLimitReached') };
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
        generatedImages.push({
            prompt: imagePrompt,
            url: artifact.asset.data,
            assetId: artifact.asset.id,
            model: result.model,
            step: index
        });
        imageCount += 1;
        onArtifact?.(artifact.asset);
        return { status: AGENTIC_STEP_STATUS.COMPLETED };
    };

    const stepHandlers = {
        text: runTextStep,
        chat: runTextStep,
        analyze: runAnalyzeStep,
        image: runImageStep
    };

    for (let index = 0; index < plan.length; index += 1) {
        if (signal?.aborted) throw new Error(AGENTIC_ABORT_CODE);
        const step = plan[index];
        updateStep(index, AGENTIC_STEP_STATUS.WORKING);
        let outcome;
        try {
            outcome = await stepHandlers[step.type](step, index);
        } catch (error) {
            if (isAbortError(error)) throw error;
            const fallbackCode = `AGENTIC_${step.type.toUpperCase()}_STEP_FAILED`;
            if (normalizeFailureCode(error, fallbackCode) === AGENTIC_IMAGE_LIMIT_CODE) {
                updateStep(index, AGENTIC_STEP_STATUS.SKIPPED, t('agentic.imageStepLimitReached'));
                continue;
            }
            const failure = recordFailure({ stepId: `agentic-${index}`, name: step.type, error, fallbackCode });
            updateStep(index, AGENTIC_STEP_STATUS.FAILED, failure.message);
            continue;
        }
        updateStep(index, outcome.status, outcome.text);
    }

    return buildPipelineResult({
        plan,
        text: buildFinalText({
            candidates: textResults,
            hasGeneratedImage: generatedImages.length > 0,
            failures,
            t,
            fallback: t('workspace.visualGeneratedNoText')
        }),
        analysis: accumulatedAnalysis,
        images: generatedImages,
        imageUrl: generatedImages.at(-1)?.url || null,
        imagePrompt: generatedImages.at(-1)?.prompt || '',
        pendingSaves: [],
        model: selectedTextModel,
        imageModel: generatedImages.at(-1)?.model || selectedImageModel,
        failures
    });
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
        if (signal?.aborted) throw new Error(AGENTIC_ABORT_CODE);

        const current = index + 1;
        const allowed = await onBeforeVariation?.({ index, current, total });
        if (allowed === false) {
            return { results, stopped: true, completed: results.length, total };
        }

        onProgress?.({ index, current, total, status: AGENTIC_STEP_STATUS.WORKING });
        let variationSteps = [];
        const result = await executeAgenticPipeline({
            ...pipelineOptions,
            prompt: promptForVariation ? promptForVariation({ index, current, total }) : pipelineOptions.prompt,
            version: version + index,
            imageCount,
            imageLimit,
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
        onProgress?.({ index, current, total, status: AGENTIC_STEP_STATUS.COMPLETED });
    }

    return { results, stopped: false, completed: results.length, total };
}

export { looksLikeVisualRequest, normalizePlan };
