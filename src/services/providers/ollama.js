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

/**
 * `/api/tags` lists names but not capabilities. `/api/show` answers per model
 * with `capabilities` (completion, vision, tools, embedding, insert), so that
 * is what the detection reads. A model whose probe fails simply reports
 * nothing, which is the honest answer rather than a guess.
 */
const SHOW_CONCURRENCY = 6;

async function fetchModelCapabilities(base, name, signal) {
    try {
        const response = await fetch(`${base}/api/show`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: name }),
            signal
        });
        if (!response.ok) return null;
        const data = await response.json();
        return Array.isArray(data?.capabilities)
            ? data.capabilities.filter((value) => typeof value === 'string' && value.trim())
            : null;
    } catch {
        return null;
    }
}

async function mapWithConcurrency(items, limit, worker) {
    const results = new Array(items.length);
    let cursor = 0;
    const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
        while (cursor < items.length) {
            const index = cursor;
            cursor += 1;
            results[index] = await worker(items[index]);
        }
    });
    await Promise.all(runners);
    return results;
}

/**
 * Lists the models the local endpoint has pulled.
 * Ollama reports the model name and family on `/api/tags`, and the real
 * capabilities on `/api/show`, which is queried for every listed model.
 */
export async function listModels({ baseUrl, signal } = {}) {
    const base = String(getBaseUrl({ baseUrl }) || '').replace(/\/$/, '');
    if (!base) return { success: false, error: 'BASE_URL_NOT_CONFIGURED', reason: 'BASE_URL_REQUIRED' };
    try {
        const response = await fetch(`${base}/api/tags`, { signal });
        if (!response.ok) {
            return { success: false, status: response.status, error: await getErrorMessageFromResponse(response) };
        }
        const data = await response.json();
        const entries = Array.isArray(data?.models) ? data.models : [];
        const names = entries
            .map((entry) => (typeof entry?.name === 'string' ? entry.name : entry?.model))
            .filter((name) => typeof name === 'string' && name.trim());
        const probed = await mapWithConcurrency(names, SHOW_CONCURRENCY, (name) => fetchModelCapabilities(base, name, signal));
        const capabilitiesByName = new Map(names.map((name, index) => [name, probed[index]]));
        return {
            success: true,
            models: entries
                .map((entry) => {
                    const name = typeof entry?.name === 'string' ? entry.name : entry?.model;
                    return {
                        id: name,
                        displayName: null,
                        ownedBy: typeof entry?.details?.family === 'string' ? entry.details.family : null,
                        contextWindow: null,
                        inputModalities: null,
                        outputModalities: null,
                        capabilities: capabilitiesByName.get(name) || null
                    };
                })
                .filter((entry) => typeof entry.id === 'string' && entry.id.trim())
        };
    } catch (error) {
        return { success: false, error: normalizeError(error) };
    }
}
