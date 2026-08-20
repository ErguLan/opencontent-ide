/**
 * OpenRouter Provider
 * OpenContent IDE
 *
 * Aggregates many models behind an OpenAI-compatible chat completions API.
 * Image generation is supported for models that expose image modalities.
 */

import {
    getErrorMessageFromResponse,
    normalizeError,
    extractImageFromOpenRouterData
} from './shared.js';
import { readOpenAIStream, createStreamAccumulator } from './streaming.js';
import { appendOpenAIToolContext } from './toolContext.js';

const BASE_URL = 'https://openrouter.ai/api/v1';

function getKey(config) {
    const key = config?.apiKey || (typeof window !== 'undefined' ? localStorage.getItem('oc_k_or') : '') || import.meta.env.VITE_OPENROUTER_API_KEY || '';
    if (!key) throw new Error('API_KEY_NOT_CONFIGURED');
    return key;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 45000) {
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

function buildMessages(prompt, options = {}) {
    if (Array.isArray(options.messages) && options.messages.length > 0) return options.messages;
    const messages = [];
    if (options.systemPrompt) {
        messages.push({ role: 'system', content: options.systemPrompt });
    }
    const imageUrls = Array.isArray(options.imageUrls)
        ? options.imageUrls.filter(Boolean)
        : options.imageUrl
            ? [options.imageUrl]
            : [];

    if (imageUrls.length > 0) {
        const content = [{ type: 'text', text: prompt }];
        imageUrls.forEach((url) => content.push({ type: 'image_url', image_url: { url } }));
        messages.push({ role: 'user', content });
    } else {
        messages.push({ role: 'user', content: prompt });
    }
    return messages;
}

export async function send(prompt, model, options = {}, retries = 3, delay = 2000) {
    const apiKey = getKey(options);
    const messages = options.toolContext
        ? appendOpenAIToolContext(buildMessages(prompt, options), options.toolContext)
        : buildMessages(prompt, options);
    const stream = Boolean(options.stream);
    const body = {
        model,
        messages,
        max_tokens: options.maxTokens || 1024,
        temperature: options.temperature ?? 0.7,
        stream
    };
    if (options.responseFormat) {
        body.response_format = options.responseFormat;
    }
    if (Array.isArray(options.tools) && options.tools.length > 0) {
        body.tools = options.tools;
        body.tool_choice = options.toolChoice || 'auto';
        if (typeof options.parallelToolCalls === 'boolean') body.parallel_tool_calls = options.parallelToolCalls;
    }

    try {
        const response = await fetchWithTimeout(`${BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://opencontent-ide.github.io',
                'X-Title': 'OpenContent IDE'
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

        if (stream) {
            const accumulator = createStreamAccumulator();
            for await (const chunk of readOpenAIStream(response)) {
                accumulator.append(chunk);
                options.onChunk?.(chunk, accumulator.getContent());
            }
            return {
                success: true,
                content: accumulator.getContent(),
                model,
                usage: {}
            };
        }

        const data = await response.json();
        const message = data.choices?.[0]?.message || {};
        return {
            success: true,
            content: message.content || '',
            model,
            usage: data.usage,
            toolCalls: message.tool_calls || [],
            assistantMessage: message,
            imageUrl: extractImageFromOpenRouterData(data)
        };
    } catch (error) {
        return { success: false, error: normalizeError(error) };
    }
}

export async function generateImage(prompt, model, options = {}, retries = 3, delay = 2000) {
    const apiKey = getKey(options);
    const size = options.size || '1024x1024';
    const quality = options.quality || 'standard';
    const style = options.style || 'vivid';
    const negPrompt = options.negativePrompt || '';
    const enhancedPrompt = negPrompt
        ? `${prompt}\n\nStyle: ${style}, quality: ${quality}, size: ${size}.\nExclude: ${negPrompt}`
        : `${prompt}\n\nStyle: ${style}, quality: ${quality}, size: ${size}.`;

    try {
        const response = await fetchWithTimeout(`${BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://opencontent-ide.github.io',
                'X-Title': 'OpenContent IDE'
            },
            body: JSON.stringify({
                model,
                modalities: ['image'],
                messages: [{ role: 'user', content: enhancedPrompt }]
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
        const imageUrl = extractImageFromOpenRouterData(data);
        if (imageUrl) return { success: true, imageUrl, model };
        return { success: false, error: 'NO_IMAGE_IN_RESPONSE' };
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
