/**
 * Ollama Provider
 * OpenContent IDE
 *
 * Local model inference. Supports text chat only in the current version.
 */

import { getErrorMessageFromResponse, normalizeError } from './shared.js';
import { STORAGE_KEYS } from '../../config/constants';
import { appendOllamaToolContext } from './toolContext.js';

function getBaseUrl(config) {
    return config?.baseUrl || (typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEYS.OLLAMA_URL) : '') || import.meta.env.VITE_OLLAMA_BASE_URL || 'http://localhost:11434';
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 120000) {
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

export async function send(prompt, model, options = {}) {
    const baseUrl = getBaseUrl(options);
    const messages = [];
    if (options.systemPrompt) {
        messages.push({ role: 'system', content: options.systemPrompt });
    }
    const imageUrls = Array.isArray(options.imageUrls)
        ? options.imageUrls.filter(Boolean)
        : options.imageUrl ? [options.imageUrl] : [];
    const userMessage = { role: 'user', content: prompt };
    if (imageUrls.length > 0) {
        userMessage.images = imageUrls
            .map((url) => String(url).split(',')[1] || String(url))
            .filter(Boolean);
    }
    messages.push(userMessage);
    const requestMessages = options.toolContext
        ? appendOllamaToolContext(messages, options.toolContext)
        : (options.messages || messages);

    try {
        const response = await fetchWithTimeout(`${baseUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model,
                messages: requestMessages,
                stream: false,
                ...(Array.isArray(options.tools) && options.tools.length > 0 ? { tools: options.tools } : {})
            }),
            signal: options.signal
        });

        if (!response.ok) {
            const msg = await getErrorMessageFromResponse(response);
            throw new Error(msg);
        }
        const data = await response.json();
        return {
            success: true,
            content: data.message?.content || '',
            model,
            provider: 'ollama',
            toolCalls: data.message?.tool_calls || [],
            assistantMessage: data.message
        };
    } catch (error) {
        return { success: false, error: normalizeError(error) };
    }
}

export async function generateImage() {
    return { success: false, error: 'IMAGE_GENERATION_NOT_SUPPORTED' };
}

export async function analyzeImage(imageUrl, prompt = 'Describe this image in detail', options = {}) {
    if (!options.visionModel) return { success: false, error: 'VISION_MODEL_NOT_SELECTED' };
    const result = await send(prompt, options.visionModel, { ...options, imageUrl });
    if (!result.success) return result;
    return { success: true, analysis: result.content, model: result.model };
}

export async function listModels(config = {}) {
    const baseUrl = getBaseUrl(config);
    try {
        const response = await fetch(`${baseUrl}/api/tags`);
        if (!response.ok) throw new Error('Connection failed');
        const data = await response.json();
        return (data.models || []).map((m) => m.name || m.model);
    } catch (error) {
        return { success: false, error: normalizeError(error) };
    }
}
