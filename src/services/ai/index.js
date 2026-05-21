/**
 * AI Service - Central Configuration
 * OpenContent IDE
 * 
 * Supports: OpenRouter, Gemini, Ollama (local)
 * BYOK — Bring Your Own Key
 * 
 * Keys are read from localStorage first (set via Settings UI),
 * then fall back to environment variables (.env).
 */

import { STORAGE_KEYS } from '../../config/constants';
import skills from '../../data/skills.json';

// localStorage key names for API keys (obfuscated slightly)
const LS_KEYS = {
    OPENROUTER: 'oc_k_or',
    GEMINI: 'oc_k_gm',
    OPENAI: 'oc_k_oa'
};

/**
 * Get an API key — localStorage first, then .env fallback
 */
function getKey(lsKey, envValue) {
    if (typeof window !== 'undefined') {
        const stored = localStorage.getItem(lsKey);
        if (stored) return stored;
    }
    return envValue || '';
}

// AI Configuration (dynamic getters for keys)
export const AI_CONFIG = {
    get OPENROUTER_API_KEY() { return getKey(LS_KEYS.OPENROUTER, import.meta.env.VITE_OPENROUTER_API_KEY); },
    OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',
    get GEMINI_API_KEY() { return getKey(LS_KEYS.GEMINI, import.meta.env.VITE_GEMINI_API_KEY); },
    get OPENAI_API_KEY() { return getKey(LS_KEYS.OPENAI, import.meta.env.VITE_OPENAI_API_KEY); },
    get OLLAMA_BASE_URL() { return (typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEYS.OLLAMA_URL)) || import.meta.env.VITE_OLLAMA_BASE_URL || 'http://localhost:11434'; },
    REQUEST_TIMEOUT_MS: Number(import.meta.env.VITE_AI_REQUEST_TIMEOUT_MS || 45000),
    DEFAULT_TEXT_MODEL: 'google/gemini-3.1-flash-lite',
    DEFAULT_IMAGE_MODEL: 'google/gemini-3.1-flash-lite',
    DEFAULT_IMAGE_GENERATION: 'bytedance-seed/seedream-4.5'
};

/**
 * Save/remove API keys from localStorage (called from Settings UI)
 */
export function saveApiKey(provider, key) {
    const lsKey = LS_KEYS[provider.toUpperCase()];
    if (!lsKey) return;
    if (key && key.trim()) {
        localStorage.setItem(lsKey, key.trim());
    } else {
        localStorage.removeItem(lsKey);
    }
}

export function getApiKey(provider) {
    const map = { openrouter: LS_KEYS.OPENROUTER, gemini: LS_KEYS.GEMINI, openai: LS_KEYS.OPENAI };
    const lsKey = map[provider.toLowerCase()];
    if (!lsKey) return '';
    return localStorage.getItem(lsKey) || '';
}

export function clearAllApiKeys() {
    Object.values(LS_KEYS).forEach(k => localStorage.removeItem(k));
}

// Skills system
export const SKILLS = skills;

export function getSkillById(id) {
    return SKILLS.find(s => s.id === id) || SKILLS[0];
}

export function getActiveSkill() {
    const saved = localStorage.getItem(STORAGE_KEYS.ACTIVE_SKILL);
    return getSkillById(saved || 'content-creator');
}

// Model catalogs (curated defaults)
export const TEXT_MODEL_CATALOG = [
    { id: 'google/gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite', tier: 'all', description: 'Fast, free Google model.' },
    { id: 'openai/gpt-5.5', name: 'GPT-5.5', tier: 'pro', description: 'Premium OpenAI model.' },
    { id: 'nvidia/nemotron-nano-12b-v2-vl:free', name: 'Nanometron 12B', tier: 'all', description: 'Free vision-capable model.' }
];

export const IMAGE_MODEL_CATALOG = [
    { id: 'x-ai/grok-imagine-image-quality', name: 'Grok Imagine (Quality)', tier: 'pro', description: 'Top-tier image generation.' },
    { id: 'bytedance-seed/seedream-4.5', name: 'Seedream 4.5', tier: 'all', description: 'Great quality, fast generation.' },
    { id: 'sourceful/riverflow-v2-fast', name: 'Riverflow V2 Fast', tier: 'all', description: 'Lightweight free image model.' }
];

const TEXT_MODEL_CAPABILITIES = {
    'google/gemini-3.1-flash-lite': { visualInput: true },
    'openai/gpt-5.5': { visualInput: true },
    'nvidia/nemotron-nano-12b-v2-vl:free': { visualInput: true }
};

export function getTextModelOptions() { return TEXT_MODEL_CATALOG; }
export function getImageModelOptions() { return IMAGE_MODEL_CATALOG; }

export function supportsVisualInputModel(modelId = '') {
    const key = String(modelId || '').trim();
    if (!key) return false;
    if (TEXT_MODEL_CAPABILITIES[key]) return Boolean(TEXT_MODEL_CAPABILITIES[key].visualInput);
    const n = key.toLowerCase();
    return n.includes('-vl') || n.includes('vision') || n.includes('multimodal');
}

export function isAIConfigured() {
    return !!(AI_CONFIG.OPENROUTER_API_KEY || AI_CONFIG.GEMINI_API_KEY || AI_CONFIG.OPENAI_API_KEY);
}

export function isOllamaConfigured() {
    return Boolean(AI_CONFIG.OLLAMA_BASE_URL);
}

export function getAvailableProviders() {
    const providers = [];
    if (AI_CONFIG.OPENROUTER_API_KEY) providers.push('openrouter');
    if (AI_CONFIG.GEMINI_API_KEY) providers.push('gemini');
    if (AI_CONFIG.OPENAI_API_KEY) providers.push('openai');
    if (isOllamaConfigured()) providers.push('ollama');
    return providers;
}

// Helpers
const getErrorMessageFromResponse = async (response) => {
    try {
        const payload = await response.json();
        return payload?.error?.message || payload?.message || `HTTP_${response.status}`;
    } catch { return `HTTP_${response.status}`; }
};

const uniqueModels = (models) => [...new Set(models.filter(Boolean))];
const getNormalizedErrorMessage = (error) => {
    if (error?.message === 'REQUEST_TIMEOUT') return 'REQUEST_TIMEOUT';
    if (error?.message === 'REQUEST_ABORTED') return 'REQUEST_ABORTED';
    return error?.message || 'AI_REQUEST_FAILED';
};

const getEffectiveRequestTimeoutMs = () => {
    const fallback = AI_CONFIG.REQUEST_TIMEOUT_MS;
    if (typeof window === 'undefined') return fallback;
    const stored = Number(localStorage.getItem(STORAGE_KEYS.AI_TIMEOUT_MS));
    if (!Number.isFinite(stored)) return fallback;
    return Math.min(120000, Math.max(10000, stored));
};

const fetchWithTimeout = async (url, options = {}, timeoutMs = getEffectiveRequestTimeoutMs()) => {
    const externalSignal = options?.signal;
    const controller = new AbortController();
    let timedOut = false;
    const abortFromExternal = () => controller.abort();
    if (externalSignal?.aborted) throw new Error('REQUEST_ABORTED');
    if (externalSignal) externalSignal.addEventListener('abort', abortFromExternal);
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } catch (error) {
        if (timedOut) throw new Error('REQUEST_TIMEOUT');
        if (externalSignal?.aborted) throw new Error('REQUEST_ABORTED');
        throw error;
    } finally {
        clearTimeout(timer);
        if (externalSignal) externalSignal.removeEventListener('abort', abortFromExternal);
    }
};

const isProbablyHttpUrl = (v) => { try { const p = new URL(v); return p.protocol === 'http:' || p.protocol === 'https:'; } catch { return false; } };
const isProbablyBase64 = (v) => typeof v === 'string' && v.length > 200 && /^[A-Za-z0-9+/=]+$/.test(v);
const toDataUrl = (raw, mime = 'image/png') => { if (!raw || typeof raw !== 'string') return null; if (raw.startsWith('data:image')) return raw; if (!isProbablyBase64(raw)) return null; return `data:${mime};base64,${raw}`; };

const extractImageFromOpenRouterData = (data) => {
    if (!data?.choices?.[0]?.message) return null;
    const message = data.choices[0].message;
    const images = message.images;
    if (Array.isArray(images) && images.length > 0) {
        const i0 = images[0] || {};
        if (isProbablyHttpUrl(i0?.image_url?.url)) return i0.image_url.url;
        if (isProbablyHttpUrl(i0?.url)) return i0.url;
        const d = toDataUrl(i0?.b64_json || i0?.base64 || i0?.data, i0?.mime_type);
        if (d) return d;
    }
    const content = message.content;
    if (typeof content === 'string') {
        const m = content.match(/https?:\/\/[^\s"')]+/i);
        if (m?.[0] && isProbablyHttpUrl(m[0])) return m[0];
        const d = toDataUrl(content);
        if (d) return d;
    }
    if (Array.isArray(content)) {
        for (const part of content) {
            if (isProbablyHttpUrl(part?.image_url?.url)) return part.image_url.url;
            if (isProbablyHttpUrl(part?.url)) return part.url;
            const d = toDataUrl(part?.b64_json || part?.image_base64 || part?.base64 || part?.data || part?.inline_data?.data, part?.mime_type || part?.inline_data?.mime_type);
            if (d) return d;
            if (typeof part?.text === 'string') { const u = part.text.match(/https?:\/\/[^\s"')]+/i)?.[0]; if (u && isProbablyHttpUrl(u)) return u; }
        }
    }
    let found = null;
    const scan = (node) => { if (found || node == null) return; if (typeof node === 'string') { if (isProbablyHttpUrl(node)) { found = node; return; } const d = toDataUrl(node); if (d) found = d; return; } if (Array.isArray(node)) { node.forEach(scan); return; } if (typeof node === 'object') Object.values(node).forEach(scan); };
    scan(message);
    return found;
};

/**
 * Detect provider: ollama (no slash), openrouter (has slash)
 */
function detectProvider(model) {
    if (!model) return 'openrouter';
    const ollamaUrl = localStorage.getItem(STORAGE_KEYS.OLLAMA_URL) || AI_CONFIG.OLLAMA_BASE_URL;
    // Models without a "/" are Ollama models (e.g. "llama3", "mistral")
    if (!model.includes('/') && ollamaUrl) return 'ollama';
    return 'openrouter';
}

/**
 * Send a text prompt to AI (OpenRouter or Ollama)
 */
export async function sendToAI(prompt, model = AI_CONFIG.DEFAULT_TEXT_MODEL, options = {}, retries = 3, delay = 2000) {
    const provider = detectProvider(model);

    if (provider === 'ollama') {
        return sendToOllama(prompt, model, options);
    }

    if (!AI_CONFIG.OPENROUTER_API_KEY) throw new Error('API_KEY_NOT_CONFIGURED');

    const skill = options.skill || getActiveSkill();
    const systemPrompt = options.systemPrompt || skill.systemPrompt;
    const requestedModel = model || AI_CONFIG.DEFAULT_TEXT_MODEL;
    const resolvedImageUrls = Array.isArray(options.imageUrls) ? options.imageUrls.filter(Boolean) : (options.imageUrl ? [options.imageUrl] : []);
    const hasImageInput = resolvedImageUrls.length > 0;
    const candidateModels = hasImageInput
        ? uniqueModels([requestedModel, options.visionModel, AI_CONFIG.DEFAULT_IMAGE_MODEL, AI_CONFIG.DEFAULT_TEXT_MODEL])
        : uniqueModels([requestedModel, AI_CONFIG.DEFAULT_TEXT_MODEL]);

    try {
        const userContentArr = [];
        if (hasImageInput) {
            userContentArr.push({ type: 'text', text: prompt });
            resolvedImageUrls.forEach((url) => userContentArr.push({ type: 'image_url', image_url: { url } }));
        }
        let lastError = null;
        for (const candidateModel of candidateModels) {
            const response = await fetchWithTimeout(`${AI_CONFIG.OPENROUTER_BASE_URL}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${AI_CONFIG.OPENROUTER_API_KEY}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': window.location.origin,
                    'X-Title': 'OpenContent IDE'
                },
                body: JSON.stringify({
                    model: candidateModel,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: hasImageInput ? userContentArr : prompt }
                    ],
                    max_tokens: options.maxTokens || 1024,
                    temperature: options.temperature || 0.7
                }),
                signal: options.signal
            });
            if (response.status === 429 && retries > 0) {
                await new Promise(res => setTimeout(res, delay));
                return sendToAI(prompt, candidateModel, options, retries - 1, delay * 2);
            }
            if (!response.ok) {
                const msg = await getErrorMessageFromResponse(response);
                lastError = `${candidateModel}: ${msg}`;
                if ([404, 400, 422].includes(response.status)) continue;
                throw new Error(lastError);
            }
            const data = await response.json();
            return { success: true, content: data.choices[0]?.message?.content || '', model: candidateModel, usage: data.usage };
        }
        throw new Error(lastError || 'AI_REQUEST_FAILED');
    } catch (error) {
        return { success: false, error: getNormalizedErrorMessage(error) };
    }
}

/**
 * Send to Ollama (local models)
 */
async function sendToOllama(prompt, model, options = {}) {
    const ollamaUrl = localStorage.getItem(STORAGE_KEYS.OLLAMA_URL) || AI_CONFIG.OLLAMA_BASE_URL;
    const skill = options.skill || getActiveSkill();
    try {
        const response = await fetchWithTimeout(`${ollamaUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: model,
                messages: [
                    { role: 'system', content: options.systemPrompt || skill.systemPrompt },
                    { role: 'user', content: prompt }
                ],
                stream: false
            }),
            signal: options.signal
        });
        if (!response.ok) {
            const msg = await getErrorMessageFromResponse(response);
            throw new Error(msg);
        }
        const data = await response.json();
        return { success: true, content: data.message?.content || '', model: model, provider: 'ollama' };
    } catch (error) {
        return { success: false, error: getNormalizedErrorMessage(error) };
    }
}

/**
 * Analyze an image using vision model
 */
export async function analyzeImage(imageUrl, prompt = 'Describe this image in detail', options = {}) {
    if (!AI_CONFIG.OPENROUTER_API_KEY) throw new Error('API_KEY_NOT_CONFIGURED');
    try {
        const response = await fetchWithTimeout(`${AI_CONFIG.OPENROUTER_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${AI_CONFIG.OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': window.location.origin,
                'X-Title': 'OpenContent IDE'
            },
            body: JSON.stringify({
                model: AI_CONFIG.DEFAULT_IMAGE_MODEL,
                messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: imageUrl } }] }],
                max_tokens: 1024
            }),
            signal: options.signal
        });
        if (!response.ok) { const m = await getErrorMessageFromResponse(response); throw new Error(m || 'IMAGE_ANALYSIS_FAILED'); }
        const data = await response.json();
        return { success: true, analysis: data.choices[0]?.message?.content || '', model: AI_CONFIG.DEFAULT_IMAGE_MODEL };
    } catch (error) {
        return { success: false, error: getNormalizedErrorMessage(error) };
    }
}

/**
 * Generate an image
 */
export async function generateImage(prompt, model = AI_CONFIG.DEFAULT_IMAGE_GENERATION, retries = 3, delay = 2000, requestOptions = {}) {
    const isOpenRouterModel = model.includes('/');
    if (isOpenRouterModel) return generateImageViaOpenRouter(prompt, model, retries, delay, requestOptions);
    return generateImageViaGemini(prompt, model, retries, delay, requestOptions);
}

async function generateImageViaOpenRouter(prompt, model, retries = 3, delay = 2000, requestOptions = {}) {
    if (!AI_CONFIG.OPENROUTER_API_KEY) return { success: false, error: 'OPENROUTER_API_KEY_NOT_CONFIGURED' };
    try {
        const response = await fetchWithTimeout(`${AI_CONFIG.OPENROUTER_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${AI_CONFIG.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json', 'HTTP-Referer': window.location.origin, 'X-Title': 'OpenContent IDE' },
            body: JSON.stringify({ model, modalities: ["image"], messages: [{ role: 'user', content: prompt }] }),
            signal: requestOptions.signal
        });
        if (response.status === 429 && retries > 0) { await new Promise(r => setTimeout(r, delay)); return generateImageViaOpenRouter(prompt, model, retries - 1, delay * 2, requestOptions); }
        if (!response.ok) { const m = await getErrorMessageFromResponse(response); throw new Error(m || 'IMAGE_GENERATION_FAILED'); }
        const data = await response.json();
        const imageUrl = extractImageFromOpenRouterData(data);
        if (imageUrl) return { success: true, imageUrl, model };
        return { success: false, error: 'NO_IMAGE_IN_RESPONSE' };
    } catch (error) {
        return { success: false, error: getNormalizedErrorMessage(error) };
    }
}

async function generateImageViaGemini(prompt, model, retries = 3, delay = 2000, requestOptions = {}) {
    if (!AI_CONFIG.GEMINI_API_KEY) return { success: false, error: 'GEMINI_API_KEY_NOT_CONFIGURED' };
    try {
        const response = await fetchWithTimeout(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${AI_CONFIG.GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: `Generate a high-quality, professional image: ${prompt}. Style: modern, clean, suitable for social media.` }] }], generationConfig: { responseModalities: ["TEXT", "IMAGE"] } }),
                signal: requestOptions.signal
            },
            getEffectiveRequestTimeoutMs()
        );
        if (response.status === 429 && retries > 0) { await new Promise(r => setTimeout(r, delay)); return generateImageViaGemini(prompt, model, retries - 1, delay * 2, requestOptions); }
        if (!response.ok) { const m = await getErrorMessageFromResponse(response); throw new Error(m || 'IMAGE_GENERATION_FAILED'); }
        const data = await response.json();
        const parts = data.candidates?.[0]?.content?.parts || [];
        const imagePart = parts.find(p => p.inlineData?.mimeType?.startsWith('image/'));
        if (imagePart?.inlineData) return { success: true, imageUrl: `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`, model };
        return { success: false, error: 'NO_IMAGE_IN_RESPONSE' };
    } catch (error) {
        const n = getNormalizedErrorMessage(error);
        return { success: false, error: n.includes('429') ? 'Rate limit exceeded. Please wait 1 minute.' : n };
    }
}

export default {
    AI_CONFIG, TEXT_MODEL_CATALOG, IMAGE_MODEL_CATALOG, SKILLS,
    isAIConfigured, isOllamaConfigured, getAvailableProviders,
    getTextModelOptions, getImageModelOptions, supportsVisualInputModel,
    getSkillById, getActiveSkill,
    sendToAI, analyzeImage, generateImage
};
