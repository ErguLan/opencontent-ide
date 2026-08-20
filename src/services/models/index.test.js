import { describe, it, expect, beforeEach } from 'vitest';
import {
    getStoredModels,
    addModel,
    removeModel,
    resolveModel,
    supportsVision,
    PROVIDERS
} from './index.js';

describe('Model Registry', () => {
    beforeEach(() => {
        // Clean localStorage before each test
        localStorage.clear();
    });

    it('returns empty array when no models are stored', () => {
        const models = getStoredModels();
        expect(models.length).toBe(0);
    });

    it('adds and removes a custom model', () => {
        addModel({
            id: 'custom/test-model',
            nickname: 'Test',
            provider: PROVIDERS.OPENROUTER,
            capabilities: { text: true }
        });
        expect(getStoredModels().length).toBe(1);

        removeModel('custom/test-model');
        expect(getStoredModels().length).toBe(0);
    });

    it('resolves a known model by id', () => {
        addModel({
            id: 'test-openai-model',
            provider: PROVIDERS.OPENAI,
            capabilities: { text: true }
        });
        const resolved = resolveModel('test-openai-model');
        expect(resolved).toBeDefined();
        expect(resolved.id).toBe('test-openai-model');
    });

    it('reports vision support only for models with vision capability', () => {
        addModel({
            id: 'vision-model',
            provider: PROVIDERS.OPENAI,
            capabilities: { text: true, vision: true }
        });
        expect(supportsVision('vision-model')).toBe(true);
        expect(supportsVision('non-existing-model')).toBe(false);
    });
});
