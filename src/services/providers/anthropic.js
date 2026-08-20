/**
 * Anthropic (Claude) Provider
 * OpenContent IDE
 *
 * Direct calls to Anthropic Messages API.
 * Supports text and vision. Image generation is not supported.
 */

import { getErrorMessageFromResponse, normalizeError } from './shared.js';
import { appendAnthropicToolContext } from './toolContext.js';

const BASE_URL = 'https://api.anthropic.com/v1/messages';

function getKey(config) {
    const key = config?.apiKey || (typeof window !== 'undefined' ? localStorage.getItem('oc_k_an') : '') || import.meta.env.VITE_ANTHROPIC_API_KEY || '';
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

function buildContent(prompt, options = {}) {
    const imageUrls = Array.isArray(options.imageUrls)
        ? options.imageUrls.filter(Boolean)
        : options.imageUrl
            ? [options.imageUrl]
            : [];

    const content = [];
    if (imageUrls.length > 0) {
        imageUrls.forEach((url) => {
            if (url.startsWith('data:')) {
                const [header, base64] = url.split(',');
                const mediaType = header.split(';')[0].split(':')[1] || 'image/png';
                content.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } });
            } else {
                content.push({ type: 'image', source: { type: 'url', url } });
            }
        });
    }
    content.push({ type: 'text', text: prompt });
    return content;
}

export async function send(prompt, model, options = {}, retries = 3, delay = 2000) {
    const apiKey = getKey(options);
    const baseMessages = Array.isArray(options.messages) && options.messages.length > 0
        ? options.messages
        : [{ role: 'user', content: buildContent(prompt, options) }];
    const messages = options.toolContext
        ? appendAnthropicToolContext(baseMessages, options.toolContext)
        : baseMessages;
    const body = {
        model,
        max_tokens: options.maxTokens || 1024,
        temperature: options.temperature ?? 0.7,
        messages
    };
    if (options.systemPrompt) body.system = options.systemPrompt;
    if (Array.isArray(options.tools) && options.tools.length > 0) {
        body.tools = options.tools
            .filter((tool) => tool?.type === 'function' && tool.function?.name)
            .map((tool) => ({
                name: tool.function.name,
                description: tool.function.description,
                input_schema: tool.function.parameters
            }));
        body.tool_choice = options.toolChoice === 'none'
            ? { type: 'none' }
            : { type: 'auto' };
    }

    try {
        const response = await fetchWithTimeout(BASE_URL, {
            method: 'POST',
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body),
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
        const text = data.content?.map((block) => block.text || '').join('') || '';
        const toolCalls = data.content
            ?.filter((block) => block.type === 'tool_use')
            .map((block) => ({ id: block.id, type: 'function', function: { name: block.name, arguments: JSON.stringify(block.input || {}) } })) || [];
        return { success: true, content: text, model, toolCalls, assistantMessage: { role: 'assistant', content: data.content } };
    } catch (error) {
        return { success: false, error: normalizeError(error) };
    }
}

export async function generateImage() {
    return { success: false, error: 'IMAGE_GENERATION_NOT_SUPPORTED' };
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
