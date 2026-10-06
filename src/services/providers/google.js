/**
 * Google (Gemini) Provider
 * OpenContent IDE
 *
 * Direct calls to Google Generative Language API.
 * Supports text, vision, and native image generation.
 */

import { getErrorMessageFromResponse, normalizeError } from './shared.js';
import { appendGoogleToolContext } from './toolContext.js';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

function getKey(config) {
    const key = config?.apiKey || (typeof window !== 'undefined' ? localStorage.getItem('oc_k_gm') : '') || import.meta.env.VITE_GEMINI_API_KEY || '';
    if (!key) throw new Error('API_KEY_NOT_CONFIGURED');
    return key;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 60000) {
    const controller = new AbortController();
    const externalSignal = options.signal;
    let timedOut = false;
    if (externalSignal?.aborted) throw new Error('REQUEST_ABORTED');
    if (externalSignal) externalSignal.addEventListener('abort', () => controller.abort());
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } catch (error) {
        if (timedOut) throw new Error('REQUEST_TIMEOUT');
        if (externalSignal?.aborted) throw new Error('REQUEST_ABORTED');
        throw error;
    } finally {
        clearTimeout(timer);
        if (externalSignal) externalSignal.removeEventListener('abort', () => controller.abort());
    }
}

function buildContents(prompt, options = {}) {
    if (Array.isArray(options.contents) && options.contents.length > 0) return options.contents;
    const system = options.systemPrompt ? [{ role: 'user', parts: [{ text: options.systemPrompt }] }, { role: 'model', parts: [{ text: 'OK' }] }] : [];
    const imageUrls = Array.isArray(options.imageUrls)
        ? options.imageUrls.filter(Boolean)
        : options.imageUrl
            ? [options.imageUrl]
            : [];

    const parts = [{ text: prompt }];
    imageUrls.forEach((url) => {
        if (url.startsWith('data:')) {
            const [header, base64] = url.split(',');
            const mime = header.split(';')[0].split(':')[1] || 'image/png';
            parts.push({ inlineData: { mimeType: mime, data: base64 } });
        } else {
            parts.push({ fileData: { mimeType: 'image/png', fileUri: url } });
        }
    });

    return [...system, { role: 'user', parts }];
}

function toGoogleTools(tools = []) {
    const normalizeSchema = (schema = {}) => {
        const normalized = { ...schema };
        delete normalized.additionalProperties;
        if (normalized.properties) {
            normalized.properties = Object.fromEntries(
                Object.entries(normalized.properties).map(([key, value]) => [key, normalizeSchema(value)])
            );
        }
        if (normalized.items) normalized.items = normalizeSchema(normalized.items);
        return normalized;
    };
    const declarations = tools
        .filter((tool) => tool?.type === 'function' && tool.function?.name)
        .map((tool) => ({
            name: tool.function.name,
            description: tool.function.description,
            parameters: normalizeSchema(tool.function.parameters)
        }));
    return declarations.length > 0 ? [{ functionDeclarations: declarations }] : undefined;
}

export async function send(prompt, model, options = {}, retries = 3, delay = 2000) {
    const apiKey = getKey(options);
    const contents = options.toolContext
        ? appendGoogleToolContext(buildContents(prompt, options), options.toolContext)
        : buildContents(prompt, options);
    const url = `${BASE_URL}/${model}:generateContent?key=${apiKey}`;

    try {
        const response = await fetchWithTimeout(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents,
                generationConfig: {
                    temperature: options.temperature ?? 0.7,
                    maxOutputTokens: options.maxTokens || 1024
                },
                ...(toGoogleTools(options.tools) ? { tools: toGoogleTools(options.tools) } : {}),
                ...(options.toolChoice ? { toolConfig: { functionCallingConfig: { mode: options.toolChoice === 'none' ? 'NONE' : 'AUTO' } } } : {})
            }),
            signal: options.signal
        });

        if (response.status === 429 && retries > 0) {
            await new Promise((resolve) => setTimeout(resolve, delay));
            return send(prompt, model, options, retries - 1, delay * 2);
        }
        if (!response.ok) {
            const msg = await getErrorMessageFromResponse(response);
            throw new Error(msg);
        }
        const data = await response.json();
        const textParts = data.candidates?.[0]?.content?.parts || [];
        const text = textParts.map((p) => p.text || '').join('');
        const toolCalls = textParts
            .filter((part) => part.functionCall)
            .map((part, index) => ({
                id: `google_tool_${Date.now()}_${index}`,
                type: 'function',
                function: {
                    name: part.functionCall.name,
                    arguments: JSON.stringify(part.functionCall.args || {})
                }
            }));
        return { success: true, content: text, model, toolCalls, assistantMessage: data.candidates?.[0]?.content };
    } catch (error) {
        return { success: false, error: normalizeError(error) };
    }
}

export async function generateImage(prompt, model, options = {}, retries = 3, delay = 2000) {
    const apiKey = getKey(options);
    const url = `${BASE_URL}/${model}:generateContent?key=${apiKey}`;
    const quality = options.quality || 'standard';
    const style = options.style || 'vivid';
    const size = options.size || '1024x1024';
    const negPrompt = options.negativePrompt || '';
    const styleClause = `Style: ${style}, quality: ${quality}, aspect ratio based on ${size}.`;
    const negClause = negPrompt ? `\nAvoid: ${negPrompt}.` : '';
    const enhancedPrompt = `Generate a high-quality, professional image: ${prompt}. ${styleClause}${negClause} Modern, clean, suitable for social media.`;

    try {
        const response = await fetchWithTimeout(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: enhancedPrompt }] }],
                generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
            }),
            signal: options.signal
        });

        if (response.status === 429 && retries > 0) {
            await new Promise((resolve) => setTimeout(resolve, delay));
            return generateImage(prompt, model, options, retries - 1, delay * 2);
        }
        if (!response.ok) {
            const msg = await getErrorMessageFromResponse(response);
            throw new Error(msg);
        }
        const data = await response.json();
        const parts = data.candidates?.[0]?.content?.parts || [];
        const imagePart = parts.find((p) => p.inlineData?.mimeType?.startsWith('image/'));
        if (imagePart?.inlineData) {
            return {
                success: true,
                imageUrl: `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`,
                model
            };
        }
        return { success: false, error: 'NO_IMAGE_IN_RESPONSE' };
    } catch (error) {
        return { success: false, error: normalizeError(error) };
    }
}

/**
 * Lists the models available to the configured key.
 * Google reports the resource name, display name, input token limit and the
 * `supportedGenerationMethods` each model exposes. It does not declare
 * modalities per model, so those stay null and the caller must not infer them.
 */
export async function listModels({ apiKey, baseUrl, signal } = {}) {
    let key;
    try {
        key = getKey({ apiKey });
    } catch {
        return { success: false, error: 'API_KEY_NOT_CONFIGURED', reason: 'API_KEY_REQUIRED' };
    }
    const base = String(baseUrl || BASE_URL).replace(/\/$/, '');
    try {
        const response = await fetch(`${base}?key=${encodeURIComponent(key)}&pageSize=1000`, { signal });
        if (!response.ok) {
            return { success: false, status: response.status, error: await getErrorMessageFromResponse(response) };
        }
        const data = await response.json();
        const entries = Array.isArray(data?.models) ? data.models : [];
        return {
            success: true,
            models: entries
                .map((entry) => ({
                    id: typeof entry?.name === 'string' ? entry.name.replace(/^models\//, '') : '',
                    displayName: typeof entry?.displayName === 'string' ? entry.displayName : null,
                    ownedBy: null,
                    contextWindow: Number.isFinite(entry?.inputTokenLimit) ? entry.inputTokenLimit : null,
                    inputModalities: null,
                    outputModalities: null,
                    supportedGenerationMethods: Array.isArray(entry?.supportedGenerationMethods)
                        ? entry.supportedGenerationMethods
                        : null
                }))
                .filter((entry) => entry.id.trim())
        };
    } catch (error) {
        return { success: false, error: normalizeError(error) };
    }
}

export async function analyzeImage(imageUrl, prompt = 'Describe this image in detail', options = {}) {
    if (!options.visionModel) return { success: false, error: 'VISION_MODEL_NOT_SELECTED' };
    const result = await send(prompt, options.visionModel, {
        ...options,
        imageUrl,
        systemPrompt: options.systemPrompt || 'You are a helpful vision assistant.'
    });
    if (!result.success) return result;
    return { success: true, analysis: result.content, model: result.model };
}
