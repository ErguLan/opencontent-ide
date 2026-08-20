/**
 * AI Service - Central Configuration
 * OpenContent IDE
 *
 * Multi-provider AI abstraction.
 * Supports: OpenRouter, OpenAI, Google (Gemini), Anthropic (Claude), Ollama (local)
 * BYOK — Bring Your Own Key
 *
 * Keys are read from localStorage first (set via Settings UI),
 * then fall back to environment variables (.env).
 */

import { STORAGE_KEYS } from '../../config/constants';
import skills from '../../data/skills.json';
import * as openrouter from '../providers/openrouter.js';
import * as openai from '../providers/openai.js';
import * as google from '../providers/google.js';
import * as anthropic from '../providers/anthropic.js';
import * as ollama from '../providers/ollama.js';
import * as custom from '../providers/custom.js';
import {
    getStoredModels,
    resolveModel,
    supportsVision,
    PROVIDERS
} from '../models/index.js';

// localStorage key names for API keys
const LS_KEYS = {
    OPENROUTER: 'oc_k_or',
    OPENAI: 'oc_k_oa',
    GEMINI: 'oc_k_gm',
    ANTHROPIC: 'oc_k_an',
    CUSTOM: 'oc_k_custom'
};

function getKey(lsKey, envValue) {
    if (typeof window !== 'undefined') {
        const stored = localStorage.getItem(lsKey);
        if (stored) return stored;
    }
    return envValue || '';
}

export const AI_CONFIG = {
    get OPENROUTER_API_KEY() { return getKey(LS_KEYS.OPENROUTER, import.meta.env.VITE_OPENROUTER_API_KEY); },
    get OPENAI_API_KEY() { return getKey(LS_KEYS.OPENAI, import.meta.env.VITE_OPENAI_API_KEY); },
    get GEMINI_API_KEY() {
        return getKey(LS_KEYS.GEMINI, import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_GOOGLE_API_KEY);
    },
    get ANTHROPIC_API_KEY() { return getKey(LS_KEYS.ANTHROPIC, import.meta.env.VITE_ANTHROPIC_API_KEY); },
    get CUSTOM_API_KEY() { return getKey(LS_KEYS.CUSTOM, import.meta.env.VITE_CUSTOM_API_KEY); },
    get OLLAMA_BASE_URL() {
        return (typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEYS.OLLAMA_URL))
            || import.meta.env.VITE_OLLAMA_BASE_URL
            || 'http://localhost:11434';
    },
    REQUEST_TIMEOUT_MS: Number(import.meta.env.VITE_AI_REQUEST_TIMEOUT_MS || 45000)
};

export function saveApiKey(provider, key) {
    const map = {
        openrouter: LS_KEYS.OPENROUTER,
        openai: LS_KEYS.OPENAI,
        gemini: LS_KEYS.GEMINI,
        google: LS_KEYS.GEMINI,
        anthropic: LS_KEYS.ANTHROPIC,
        claude: LS_KEYS.ANTHROPIC,
        custom: LS_KEYS.CUSTOM
    };
    const lsKey = map[provider.toLowerCase()];
    if (!lsKey) return;
    if (key && key.trim()) {
        localStorage.setItem(lsKey, key.trim());
    } else {
        localStorage.removeItem(lsKey);
    }
}

export function getApiKey(provider) {
    const map = {
        openrouter: LS_KEYS.OPENROUTER,
        openai: LS_KEYS.OPENAI,
        gemini: LS_KEYS.GEMINI,
        google: LS_KEYS.GEMINI,
        anthropic: LS_KEYS.ANTHROPIC,
        claude: LS_KEYS.ANTHROPIC,
        custom: LS_KEYS.CUSTOM
    };
    const lsKey = map[provider.toLowerCase()];
    if (!lsKey) return '';
    return localStorage.getItem(lsKey) || '';
}

export function clearAllApiKeys() {
    Object.values(LS_KEYS).forEach((k) => localStorage.removeItem(k));
}

// Skills system
export const SKILLS = skills;

export function getSkillById(id) {
    return SKILLS.find((s) => s.id === id) || SKILLS[0];
}

export function getActiveSkill() {
    const saved = localStorage.getItem(STORAGE_KEYS.ACTIVE_SKILL);
    return getSkillById(saved || 'content-creator');
}

// Model registry helpers
export function getTextModelOptions() {
    return getStoredModels().filter((m) => m.capabilities?.text);
}

export function getImageModelOptions() {
    return getStoredModels().filter((m) => m.capabilities?.imageGeneration);
}

export function getVisionModelOptions() {
    return getStoredModels().filter((m) => m.capabilities?.vision);
}

export function getActiveTextModel() {
    const saved = localStorage.getItem(STORAGE_KEYS.SELECTED_TEXT_MODEL);
    return saved || null;
}

export function getActiveImageModel() {
    const saved = localStorage.getItem(STORAGE_KEYS.SELECTED_IMAGE_MODEL);
    return saved || null;
}

export function getActiveVisionModel() {
    const saved = localStorage.getItem(STORAGE_KEYS.SELECTED_VISION_MODEL);
    return saved || null;
}

export function setActiveModels(textModel = null, imageModel = null, visionModel = null) {
    if (textModel) localStorage.setItem(STORAGE_KEYS.SELECTED_TEXT_MODEL, textModel);
    if (imageModel) localStorage.setItem(STORAGE_KEYS.SELECTED_IMAGE_MODEL, imageModel);
    if (visionModel) localStorage.setItem(STORAGE_KEYS.SELECTED_VISION_MODEL, visionModel);
}

export function isStreamingEnabled() {
    return localStorage.getItem(STORAGE_KEYS.STREAMING_ENABLED) === 'true';
}

export function setStreamingEnabled(enabled) {
    localStorage.setItem(STORAGE_KEYS.STREAMING_ENABLED, String(enabled));
}

export function supportsVisualInputModel(modelId = '') {
    return supportsVision(modelId);
}

export function isOllamaConfigured() {
    return Boolean(AI_CONFIG.OLLAMA_BASE_URL);
}

export function isAIConfigured() {
    return !!(
        AI_CONFIG.OPENROUTER_API_KEY
        || AI_CONFIG.OPENAI_API_KEY
        || AI_CONFIG.GEMINI_API_KEY
        || AI_CONFIG.ANTHROPIC_API_KEY
        || isOllamaConfigured()
    );
}

export function getAvailableProviders() {
    const providers = [];
    if (AI_CONFIG.OPENROUTER_API_KEY) providers.push('openrouter');
    if (AI_CONFIG.OPENAI_API_KEY) providers.push('openai');
    if (AI_CONFIG.GEMINI_API_KEY) providers.push('google');
    if (AI_CONFIG.ANTHROPIC_API_KEY) providers.push('anthropic');
    if (isOllamaConfigured()) providers.push('ollama');
    return providers;
}

function getProviderModule(providerName) {
    switch (providerName) {
        case PROVIDERS.OPENROUTER: return openrouter;
        case PROVIDERS.OPENAI: return openai;
        case PROVIDERS.GOOGLE: return google;
        case PROVIDERS.ANTHROPIC: return anthropic;
        case PROVIDERS.OLLAMA: return ollama;
        case PROVIDERS.CUSTOM: return custom;
        default: return null;
    }
}

function getProviderApiKey(provider) {
    switch (provider) {
        case PROVIDERS.OPENROUTER: return AI_CONFIG.OPENROUTER_API_KEY;
        case PROVIDERS.OPENAI: return AI_CONFIG.OPENAI_API_KEY;
        case PROVIDERS.GOOGLE: return AI_CONFIG.GEMINI_API_KEY;
        case PROVIDERS.ANTHROPIC: return AI_CONFIG.ANTHROPIC_API_KEY;
        case PROVIDERS.CUSTOM: return AI_CONFIG.CUSTOM_API_KEY;
        default: return '';
    }
}

function buildApiOptions(model, options = {}) {
    return {
        ...options,
        apiKey: options.apiKey || getProviderApiKey(model.provider),
        baseUrl: options.baseUrl || model.baseUrl || (model.provider === PROVIDERS.OLLAMA ? AI_CONFIG.OLLAMA_BASE_URL : '')
    };
}

export async function sendToAI(prompt, modelId = getActiveTextModel(), options = {}) {
    if (!modelId) return { success: false, error: 'TEXT_MODEL_NOT_SELECTED' };
    const model = resolveModel(modelId);
    if (!model.capabilities?.text) {
        return { success: false, error: 'TEXT_MODEL_NOT_SUPPORTED' };
    }
    const provider = getProviderModule(model.provider);
    if (!provider) return { success: false, error: 'PROVIDER_NOT_SUPPORTED' };
    const apiOptions = buildApiOptions(model, options);
    const skill = options.skill || getActiveSkill();
    const systemPrompt = options.systemPrompt || skill.systemPrompt;
    return provider.send(prompt, model.id, { ...apiOptions, systemPrompt });
}

export async function analyzeImage(imageUrl, prompt = 'Describe this image in detail', options = {}) {
    const modelId = options.visionModel || getActiveVisionModel();
    if (!modelId) return { success: false, error: 'VISION_MODEL_NOT_SELECTED' };
    const model = resolveModel(modelId);
    if (!model.capabilities?.vision) {
        return { success: false, error: 'VISION_MODEL_NOT_SUPPORTED' };
    }
    const provider = getProviderModule(model.provider);
    if (!provider) return { success: false, error: 'PROVIDER_NOT_SUPPORTED' };
    const apiOptions = buildApiOptions(model, options);
    return provider.analyzeImage(imageUrl, prompt, { ...apiOptions, visionModel: model.id });
}

export async function generateImage(prompt, modelId = getActiveImageModel(), options = {}) {
    if (!modelId) return { success: false, error: 'IMAGE_MODEL_NOT_SELECTED' };
    const model = resolveModel(modelId);
    if (!model.capabilities?.imageGeneration) {
        return { success: false, error: 'IMAGE_GENERATION_NOT_SUPPORTED' };
    }
    const provider = getProviderModule(model.provider);
    if (!provider) return { success: false, error: 'PROVIDER_NOT_SUPPORTED' };
    const apiOptions = buildApiOptions(model, options);
    return provider.generateImage(prompt, model.id, apiOptions);
}

// Backwards-compatible catalog exports (deprecated, use model registry)
export const TEXT_MODEL_CATALOG = [];
export const IMAGE_MODEL_CATALOG = [];

export default {
    AI_CONFIG,
    TEXT_MODEL_CATALOG,
    IMAGE_MODEL_CATALOG,
    SKILLS,
    isAIConfigured,
    isOllamaConfigured,
    getAvailableProviders,
    getTextModelOptions,
    getImageModelOptions,
    getVisionModelOptions,
    getActiveTextModel,
    getActiveImageModel,
    getActiveVisionModel,
    supportsVisualInputModel,
    getSkillById,
    getActiveSkill,
    sendToAI,
    analyzeImage,
    generateImage,
    saveApiKey,
    getApiKey,
    clearAllApiKeys
};
