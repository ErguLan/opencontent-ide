/**
 * AI Service - Central Configuration
 * OpenContent IDE
 *
 * Multi-provider AI abstraction. Models are user-registered: the app never
 * injects or silently selects vendor model IDs.
 */

import { STORAGE_KEYS } from '../../config/constants';
import skills from '../../data/skills.json';
import * as openrouter from '../providers/openrouter.js';
import * as openai from '../providers/openai.js';
import * as google from '../providers/google.js';
import * as anthropic from '../providers/anthropic.js';
import * as ollama from '../providers/ollama.js';
import * as custom from '../providers/custom.js';
import { getStoredModels, resolveModel, supportsVision, PROVIDERS } from '../models/index.js';

const LS_KEYS = {
    OPENROUTER: 'oc_k_or',
    OPENAI: 'oc_k_oa',
    GEMINI: 'oc_k_gm',
    ANTHROPIC: 'oc_k_an',
    CUSTOM: 'oc_k_custom'
};

const UNSELECTED_MODEL = Object.freeze({
    id: '',
    nickname: '',
    provider: null,
    type: 'unselected',
    capabilities: {},
    isPlaceholder: true,
    isBuiltIn: false
});

function getKey(lsKey, envValue) {
    if (typeof window !== 'undefined') {
        const stored = localStorage.getItem(lsKey);
        if (stored) return stored;
    }
    return envValue || '';
}

function explicitOllamaUrl() {
    const stored = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEYS.OLLAMA_URL) : '';
    return stored || import.meta.env.VITE_OLLAMA_BASE_URL || '';
}

export const AI_CONFIG = {
    get OPENROUTER_API_KEY() { return getKey(LS_KEYS.OPENROUTER, import.meta.env.VITE_OPENROUTER_API_KEY); },
    get OPENAI_API_KEY() { return getKey(LS_KEYS.OPENAI, import.meta.env.VITE_OPENAI_API_KEY); },
    get GEMINI_API_KEY() { return getKey(LS_KEYS.GEMINI, import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_GOOGLE_API_KEY); },
    get ANTHROPIC_API_KEY() { return getKey(LS_KEYS.ANTHROPIC, import.meta.env.VITE_ANTHROPIC_API_KEY); },
    get CUSTOM_API_KEY() { return getKey(LS_KEYS.CUSTOM, import.meta.env.VITE_CUSTOM_API_KEY); },
    get OLLAMA_BASE_URL() { return explicitOllamaUrl() || 'http://localhost:11434'; },
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
    const lsKey = map[String(provider || '').toLowerCase()];
    if (!lsKey) return;
    if (key && key.trim()) localStorage.setItem(lsKey, key.trim());
    else localStorage.removeItem(lsKey);
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
    const lsKey = map[String(provider || '').toLowerCase()];
    return lsKey ? localStorage.getItem(lsKey) || '' : '';
}

export function clearAllApiKeys() {
    Object.values(LS_KEYS).forEach((key) => localStorage.removeItem(key));
}

export const SKILLS = skills;
export function getSkillById(id) { return SKILLS.find((skill) => skill.id === id) || SKILLS[0]; }
export function getActiveSkill() { return getSkillById(localStorage.getItem(STORAGE_KEYS.ACTIVE_SKILL) || 'content-creator'); }

function withUnselected(models) {
    return [UNSELECTED_MODEL, ...models];
}

export function getTextModelOptions() { return withUnselected(getStoredModels().filter((model) => model.capabilities?.text)); }
export function getImageModelOptions() { return withUnselected(getStoredModels().filter((model) => model.capabilities?.imageGeneration)); }
export function getVisionModelOptions() { return withUnselected(getStoredModels().filter((model) => model.capabilities?.vision)); }

function getValidSelection(storageKey, capability) {
    const saved = localStorage.getItem(storageKey);
    if (!saved) return null;
    const model = getStoredModels().find((item) => item.id === saved);
    if (!model || !model.capabilities?.[capability]) {
        localStorage.removeItem(storageKey);
        return null;
    }
    return saved;
}

export function getActiveTextModel() { return getValidSelection(STORAGE_KEYS.SELECTED_TEXT_MODEL, 'text'); }
export function getActiveImageModel() { return getValidSelection(STORAGE_KEYS.SELECTED_IMAGE_MODEL, 'imageGeneration'); }
export function getActiveVisionModel() { return getValidSelection(STORAGE_KEYS.SELECTED_VISION_MODEL, 'vision'); }

function setSelection(storageKey, value) {
    if (value === undefined) return;
    if (!value) localStorage.removeItem(storageKey);
    else localStorage.setItem(storageKey, value);
}

export function setActiveModels(textModel = undefined, imageModel = undefined, visionModel = undefined) {
    setSelection(STORAGE_KEYS.SELECTED_TEXT_MODEL, textModel);
    setSelection(STORAGE_KEYS.SELECTED_IMAGE_MODEL, imageModel);
    setSelection(STORAGE_KEYS.SELECTED_VISION_MODEL, visionModel);
}

export function isStreamingEnabled() { return localStorage.getItem(STORAGE_KEYS.STREAMING_ENABLED) === 'true'; }
export function setStreamingEnabled(enabled) { localStorage.setItem(STORAGE_KEYS.STREAMING_ENABLED, String(enabled)); }
export function supportsVisualInputModel(modelId = '') { return supportsVision(modelId); }

function providerConfigured(model) {
    if (!model?.provider) return false;
    switch (model.provider) {
        case PROVIDERS.OPENROUTER: return Boolean(AI_CONFIG.OPENROUTER_API_KEY);
        case PROVIDERS.OPENAI: return Boolean(AI_CONFIG.OPENAI_API_KEY);
        case PROVIDERS.GOOGLE: return Boolean(AI_CONFIG.GEMINI_API_KEY);
        case PROVIDERS.ANTHROPIC: return Boolean(AI_CONFIG.ANTHROPIC_API_KEY);
        case PROVIDERS.OLLAMA: return Boolean(model.baseUrl || explicitOllamaUrl() || AI_CONFIG.OLLAMA_BASE_URL);
        case PROVIDERS.CUSTOM: return Boolean(model.baseUrl);
        default: return false;
    }
}

export function isOllamaConfigured() {
    return getStoredModels().some((model) => model.provider === PROVIDERS.OLLAMA && providerConfigured(model));
}

export function isAIConfigured() {
    return getStoredModels().some((model) => model.capabilities?.text && providerConfigured(model));
}

export function getAvailableProviders() {
    const configured = new Set();
    for (const model of getStoredModels()) {
        if (providerConfigured(model)) configured.add(model.provider);
    }
    return [...configured];
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
    if (!model.capabilities?.text) return { success: false, error: 'TEXT_MODEL_NOT_SUPPORTED' };
    const provider = getProviderModule(model.provider);
    if (!provider) return { success: false, error: 'PROVIDER_NOT_SUPPORTED' };
    if (!providerConfigured(model)) return { success: false, error: 'PROVIDER_NOT_CONFIGURED' };
    const skill = options.skill || getActiveSkill();
    return provider.send(prompt, model.id, {
        ...buildApiOptions(model, options),
        systemPrompt: options.systemPrompt || skill.systemPrompt
    });
}

export async function analyzeImage(imageUrl, prompt = 'Describe this image in detail', options = {}) {
    const modelId = options.visionModel || getActiveVisionModel();
    if (!modelId) return { success: false, error: 'VISION_MODEL_NOT_SELECTED' };
    const model = resolveModel(modelId);
    if (!model.capabilities?.vision) return { success: false, error: 'VISION_MODEL_NOT_SUPPORTED' };
    const provider = getProviderModule(model.provider);
    if (!provider || !providerConfigured(model)) return { success: false, error: 'PROVIDER_NOT_CONFIGURED' };
    return provider.analyzeImage(imageUrl, prompt, { ...buildApiOptions(model, options), visionModel: model.id });
}

export async function generateImage(prompt, modelId = getActiveImageModel(), options = {}) {
    if (!modelId) return { success: false, error: 'IMAGE_MODEL_NOT_SELECTED' };
    const model = resolveModel(modelId);
    if (!model.capabilities?.imageGeneration) return { success: false, error: 'IMAGE_GENERATION_NOT_SUPPORTED' };
    const provider = getProviderModule(model.provider);
    if (!provider || !providerConfigured(model)) return { success: false, error: 'PROVIDER_NOT_CONFIGURED' };
    return provider.generateImage(prompt, model.id, buildApiOptions(model, options));
}

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
    setActiveModels,
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
