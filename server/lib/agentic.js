import { generateImageProvider, sendToProvider } from './providers.js';

const IMAGE_TOOL = {
    type: 'function',
    function: {
        name: 'generate_image',
        description: 'Generate one image when the user requests a visual result. The application supplies the image model and provider.',
        parameters: {
            type: 'object',
            additionalProperties: false,
            properties: {
                prompt: {
                    type: 'string',
                    description: 'Detailed visual brief including subject, composition, lighting, style and intended use.'
                },
                size: { type: 'string' },
                quality: { type: 'string' },
                style: { type: 'string' },
                negativePrompt: { type: 'string' }
            },
            required: ['prompt']
        }
    }
};

const AGENT_SYSTEM_PROMPT = `You coordinate a content task for an application that can generate text and images.
Write the requested text yourself. If the user requests a visual result, request the application operation generate_image with a detailed image prompt.
Do not select or invent a model or provider. Do not request filesystem, shell, network, or other operations.
After an operation result is provided, continue with a concise final response. Never claim that the application cannot generate images.`;

const JSON_FALLBACK_SYSTEM_PROMPT = `${AGENT_SYSTEM_PROMPT}
If tool calling is unavailable and an image is needed, return only JSON in this shape: {"actions":[{"name":"generate_image","arguments":{"prompt":"..."}}]}.
If no image is needed, return the requested text normally. Only generate_image is an allowed application operation.`;

const FINAL_SYSTEM_PROMPT = `You are the final response layer of a content application. Answer the user's request using the completed application operation result.
Be concise and specific. Do not claim that you cannot generate, access, or save images. Do not request another operation or mention internal tool mechanics.`;

const TOOL_ERROR_PATTERN = /(tool|function.?call|unsupported|not supported|invalid.*(tool|function))/i;
const IMAGE_OPTION_KEYS = ['size', 'quality', 'style', 'negativePrompt'];

function requiredString(value, code) {
    if (typeof value !== 'string' || !value.trim()) throw new Error(code);
    return value.trim();
}

function normalizeArguments(value) {
    if (!value) return {};
    if (typeof value === 'object') return value;
    if (typeof value !== 'string') return {};
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function normalizeToolCalls(toolCalls = []) {
    return toolCalls
        .map((call) => ({
            id: call?.id || `agent_tool_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            name: call?.function?.name || call?.name || call?.tool || '',
            arguments: normalizeArguments(call?.function?.arguments ?? call?.arguments ?? call?.parameters)
        }))
        .filter((call) => call.name === 'generate_image');
}

function parseJsonActions(content) {
    if (typeof content !== 'string' || !content.trim()) return [];
    const candidates = [content.trim().replace(/^```(?:json)?\s*|\s*```$/gi, '')];
    const objectMatch = content.match(/\{[\s\S]*\}/);
    if (objectMatch) candidates.push(objectMatch[0]);

    for (const candidate of candidates) {
        try {
            const parsed = JSON.parse(candidate);
            const actions = Array.isArray(parsed)
                ? parsed
                : Array.isArray(parsed?.actions)
                    ? parsed.actions
                    : parsed?.name || parsed?.tool
                        ? [parsed]
                        : [];
            const allowed = actions.filter((action) => (action?.name || action?.tool) === 'generate_image');
            if (allowed.length > 0) return allowed;
        } catch {
            // Normal text is not an operation request.
        }
    }
    return [];
}

function getImageOptions(baseOptions = {}, operationArguments = {}) {
    const sourceOptions = baseOptions && typeof baseOptions === 'object' ? baseOptions : {};
    const options = {};
    for (const key of IMAGE_OPTION_KEYS) {
        if (sourceOptions[key] !== undefined) options[key] = sourceOptions[key];
        if (operationArguments[key] !== undefined) options[key] = operationArguments[key];
    }
    return options;
}

function getOperationArguments(call) {
    const args = call.arguments || {};
    return {
        prompt: requiredString(args.prompt, 'IMAGE_PROMPT_REQUIRED'),
        options: getImageOptions({}, args)
    };
}

function isToolCapabilityError(error) {
    return TOOL_ERROR_PATTERN.test(String(error?.message || error || ''));
}

async function requestDecision({ prompt, textModel, textProvider, textBaseUrl, temperature, max_tokens }) {
    try {
        const response = await sendToProvider({
            prompt,
            model: textModel,
            provider: textProvider,
            baseUrl: textBaseUrl,
            systemPrompt: AGENT_SYSTEM_PROMPT,
            temperature,
            max_tokens,
            tools: [IMAGE_TOOL],
            toolChoice: 'auto',
            parallelToolCalls: false
        });
        return { response, nativeTools: true };
    } catch (error) {
        if (!isToolCapabilityError(error)) throw error;
        const response = await sendToProvider({
            prompt,
            model: textModel,
            provider: textProvider,
            baseUrl: textBaseUrl,
            systemPrompt: JSON_FALLBACK_SYSTEM_PROMPT,
            temperature,
            max_tokens
        });
        return { response, nativeTools: false };
    }
}

function operationFromDecision(response, nativeTools) {
    const nativeCall = nativeTools ? normalizeToolCalls(response.toolCalls)[0] : null;
    if (nativeCall) return { call: nativeCall, nativeTools: true };

    const fallbackAction = parseJsonActions(response.content)[0];
    if (!fallbackAction) return null;
    return {
        nativeTools: false,
        call: {
            id: `agent_tool_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            name: 'generate_image',
            arguments: normalizeArguments(fallbackAction.arguments ?? fallbackAction.parameters)
        }
    };
}

function safeOperationResult(imageResult, imageModel, imageProvider) {
    const mediaType = imageResult.imageUrl?.startsWith('data:')
        ? imageResult.imageUrl.slice(5).split(';')[0] || 'image/png'
        : 'image/png';
    return {
        name: 'generate_image',
        status: 'completed',
        model: imageResult.model || imageModel,
        provider: imageResult.provider || imageProvider,
        imageAvailable: Boolean(imageResult.imageUrl),
        mediaType
    };
}

export async function runAgenticCycle({
    prompt,
    textModel,
    textProvider,
    textBaseUrl,
    imageModel,
    imageProvider,
    imageBaseUrl,
    imageOptions = {},
    temperature,
    max_tokens
}) {
    requiredString(prompt, 'PROMPT_REQUIRED');
    requiredString(textModel, 'MODEL_REQUIRED');
    requiredString(textProvider, 'PROVIDER_REQUIRED');

    const decision = await requestDecision({
        prompt,
        textModel: textModel.trim(),
        textProvider: textProvider.trim(),
        textBaseUrl,
        temperature,
        max_tokens
    });
    if (!decision.response?.success) throw new Error(decision.response?.error || 'AGENTIC_DECISION_FAILED');

    const operation = operationFromDecision(decision.response, decision.nativeTools);
    if (!operation) {
        return {
            success: true,
            content: decision.response.content || '',
            imageUrl: null,
            model: decision.response.model || textModel,
            provider: decision.response.provider || textProvider,
            imageModel: null,
            imageProvider: null,
            operation: null,
            steps: [{ type: 'text', status: 'completed' }]
        };
    }

    requiredString(imageModel, 'IMAGE_MODEL_REQUIRED');
    requiredString(imageProvider, 'IMAGE_PROVIDER_REQUIRED');
    const operationArguments = getOperationArguments(operation.call);
    const generated = await generateImageProvider({
        prompt: operationArguments.prompt,
        model: imageModel.trim(),
        provider: imageProvider.trim(),
        baseUrl: imageBaseUrl,
        options: getImageOptions(imageOptions, operationArguments.options)
    });
    if (!generated?.success || !generated.imageUrl) throw new Error('IMAGE_GENERATION_FAILED');

    const resultForModel = safeOperationResult(generated, imageModel.trim(), imageProvider.trim());
    const finalPrompt = `${prompt}\n\nThe application completed this operation:\n${JSON.stringify(resultForModel)}\n\nReturn the final response for the user.`;
    const finalResponse = await sendToProvider({
        prompt: operation.nativeTools ? prompt : finalPrompt,
        model: textModel.trim(),
        provider: textProvider.trim(),
        baseUrl: textBaseUrl,
        systemPrompt: FINAL_SYSTEM_PROMPT,
        temperature,
        max_tokens,
        ...(operation.nativeTools ? {
            tools: [IMAGE_TOOL],
            toolChoice: 'none',
            toolContext: {
                assistantMessage: decision.response.assistantMessage,
                calls: [operation.call],
                results: [{ result: resultForModel }]
            }
        } : {})
    });
    if (!finalResponse?.success) throw new Error(finalResponse?.error || 'AGENTIC_FINAL_RESPONSE_FAILED');

    return {
        success: true,
        content: finalResponse.content || decision.response.content || '',
        imageUrl: generated.imageUrl,
        model: finalResponse.model || textModel,
        provider: finalResponse.provider || textProvider,
        imageModel: generated.model || imageModel.trim(),
        imageProvider: generated.provider || imageProvider.trim(),
        operation: resultForModel,
        steps: [
            { type: 'text', status: 'completed' },
            { type: 'image', status: 'completed' },
            { type: 'text', status: 'completed', phase: 'final' }
        ]
    };
}

export { IMAGE_TOOL };
