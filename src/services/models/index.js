/**
 * Model Registry
 * OpenContent IDE
 *
 * Stores user-defined models in localStorage.
 * Each model has an ID, nickname, provider, type, and capabilities.
 * The frontend selects models by nickname; the provider layer resolves
 * how to call them.
 */

import { STORAGE_KEYS } from '../../config/constants';

const MODELS_STORAGE_KEY = STORAGE_KEYS.MODELS || 'oc_models';

export const PROVIDERS = {
    OPENROUTER: 'openrouter',
    OPENAI: 'openai',
    GOOGLE: 'google',
    ANTHROPIC: 'anthropic',
    OLLAMA: 'ollama',
    CUSTOM: 'custom'
};

export const MODEL_TYPES = {
    TEXT: 'text',
    IMAGE: 'image',
    VISION: 'vision',
    MULTIMODAL: 'multimodal'
};

function safeParse(raw) {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

export function getStoredModels() {
    if (typeof window === 'undefined') return [];
    return safeParse(localStorage.getItem(MODELS_STORAGE_KEY));
}

export function saveModels(models) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(MODELS_STORAGE_KEY, JSON.stringify(models));
}

export function addModel(model) {
    const models = getStoredModels();
    const next = {
        id: model.id?.trim(),
        nickname: model.nickname?.trim() || model.id?.trim(),
        provider: model.provider || '',
        type: model.type || MODEL_TYPES.TEXT,
        capabilities: {
            text: Boolean(model.capabilities?.text),
            imageGeneration: Boolean(model.capabilities?.imageGeneration),
            vision: Boolean(model.capabilities?.vision),
            toolCalling: Boolean(model.capabilities?.toolCalling),
            imageEditing: Boolean(model.capabilities?.imageEditing)
        },
        baseUrl: model.baseUrl?.trim() || '',
        requestFormat: model.requestFormat || 'openai-compatible',
        isBuiltIn: false
    };
    if (!next.id) throw new Error('Model ID is required');
    if (!Object.values(PROVIDERS).includes(next.provider)) throw new Error('Provider is required');
    if (next.provider === PROVIDERS.CUSTOM && !next.baseUrl) throw new Error('Custom provider URL is required');
    // A model with no capability can never be offered in any selector, so
    // storing one only creates a dead registry entry. Capabilities are always
    // an explicit user decision and at least one is required to be useful.
    if (!Object.values(next.capabilities).some(Boolean)) {
        throw createRegistryError('MODEL_CAPABILITIES_REQUIRED', 'At least one capability is required');
    }
    if (models.some((m) => m.id === next.id)) {
        throw new Error(`Model ${next.id} already exists`);
    }
    models.push(next);
    saveModels(models);
    return next;
}

function createRegistryError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
}

/**
 * Registers a batch of discovered model IDs in one write.
 *
 * Discovered entries only prove that the model exists on the account; they
 * never prove what it can do. Capabilities must be passed explicitly, so
 * this stays an explicit user decision. IDs already in the registry (or
 * repeated inside the batch) are reported as skipped instead of overwriting.
 * `isBuiltIn` is always false: nothing here is bundled with the app.
 */
export function addModelsFromDiscovery(entries, options = {}) {
    const provider = options.provider || '';
    const baseUrl = options.baseUrl?.trim() || '';
    const type = options.type || MODEL_TYPES.TEXT;
    const capabilities = {
        text: Boolean(options.capabilities?.text),
        imageGeneration: Boolean(options.capabilities?.imageGeneration),
        vision: Boolean(options.capabilities?.vision),
        toolCalling: Boolean(options.capabilities?.toolCalling),
        imageEditing: Boolean(options.capabilities?.imageEditing)
    };
    if (!Object.values(PROVIDERS).includes(provider)) {
        throw createRegistryError('MODEL_PROVIDER_REQUIRED', 'Provider is required');
    }
    if (provider === PROVIDERS.CUSTOM && !baseUrl) {
        throw createRegistryError('MODEL_BASE_URL_REQUIRED', 'Custom provider URL is required');
    }
    if (!Object.values(capabilities).some(Boolean)) {
        throw createRegistryError('MODEL_CAPABILITIES_REQUIRED', 'At least one capability is required');
    }

    const models = getStoredModels();
    const known = new Set(models.map((model) => model.id));
    const added = [];
    const skipped = [];
    for (const entry of Array.isArray(entries) ? entries : []) {
        const id = typeof entry === 'string' ? entry.trim() : (entry?.id?.trim() || '');
        if (!id || known.has(id)) {
            if (id) skipped.push(id);
            continue;
        }
        const nickname = typeof entry === 'string' ? '' : (entry?.nickname?.trim() || '');
        const next = {
            id,
            nickname: nickname || options.nickname?.trim() || id,
            provider,
            type,
            capabilities: { ...capabilities },
            baseUrl,
            requestFormat: options.requestFormat || 'openai-compatible',
            isBuiltIn: false
        };
        models.push(next);
        known.add(id);
        added.push(next);
    }
    if (added.length > 0) saveModels(models);
    return { added, skipped };
}

export function removeModel(id) {
    const models = getStoredModels();
    const filtered = models.filter((m) => m.id !== id);
    saveModels(filtered);
}

export function updateModel(id, updates) {
    const models = getStoredModels();
    const index = models.findIndex((m) => m.id === id);
    if (index === -1) return null;
    models[index] = { ...models[index], ...updates };
    saveModels(models);
    return models[index];
}

export function getModelById(id) {
    return getStoredModels().find((m) => m.id === id);
}

export function getTextModels() {
    return getStoredModels().filter((m) => m.capabilities?.text);
}

export function getImageModels() {
    return getStoredModels().filter((m) => m.capabilities?.imageGeneration);
}

export function getVisionModels() {
    return getStoredModels().filter((m) => m.capabilities?.vision);
}

export function resolveModel(id) {
    const normalizedId = typeof id === 'string' ? id.trim() : '';
    const model = getModelById(normalizedId);
    if (model) return model;
    if (!normalizedId) {
        return {
            id: '',
            nickname: '',
            provider: null,
            type: MODEL_TYPES.TEXT,
            capabilities: { text: false, imageGeneration: false, vision: false, toolCalling: false, imageEditing: false },
            isBuiltIn: false
        };
    }
    // Unknown IDs remain unconfigured until the user registers provider and capabilities.
    return {
        id: normalizedId,
        nickname: normalizedId,
        provider: null,
        type: MODEL_TYPES.TEXT,
        capabilities: { text: false, imageGeneration: false, vision: false, toolCalling: false, imageEditing: false },
        isBuiltIn: false
    };
}

export function supportsVision(id) {
    return Boolean(resolveModel(id).capabilities?.vision);
}

export function supportsImageGeneration(id) {
    return Boolean(resolveModel(id).capabilities?.imageGeneration);
}

export function supportsToolCalling(id) {
    return Boolean(resolveModel(id).capabilities?.toolCalling);
}

export function supportsImageEditing(id) {
    return Boolean(resolveModel(id).capabilities?.imageEditing);
}
