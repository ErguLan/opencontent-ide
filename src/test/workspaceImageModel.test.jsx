/**
 * Image-model readiness for the workspace.
 *
 * The workspace used to call `isAIConfigured()`, which only inspects text
 * models. A visual prompt was therefore accepted, spent a request, failed deep
 * inside the agentic run and surfaced as a generic provider error, and the user
 * was never told to register an image model. `isImageGenerationConfigured()`
 * is the missing check the preflight in `useWorkspaceGeneration` relies on.
 *
 * `vi.resetModules()` gives a fresh module graph so the provider key is read
 * after seeding, and so every import below shares one module instance. The
 * providers are imported dynamically for the same reason: mixing a statically
 * imported provider with a dynamically imported consumer would create two
 * different React contexts.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

import { createFakeIndexedDb } from './fakeIndexedDb';

const seedTextOnlyRegistry = async () => {
    vi.resetModules();
    localStorage.setItem('oc_k_or', 'sk-or-test');
    localStorage.setItem('oc_selected_text_model', 'vendor/text-only');
    const models = await import('../services/models/index.js');
    models.addModel({
        id: 'vendor/text-only',
        provider: models.PROVIDERS.OPENROUTER,
        capabilities: { text: true }
    });
};


describe('image model readiness', () => {
    let original;

    beforeEach(() => {
        original = globalThis.indexedDB;
        globalThis.indexedDB = createFakeIndexedDb();
    });

    afterEach(() => {
        cleanup();
        globalThis.indexedDB = original;
        vi.restoreAllMocks();
    });

    it('is not ready when the registry holds only a text model', async () => {
        await seedTextOnlyRegistry();
        const ai = await import('../services/ai/index.js');
        expect(ai.isAIConfigured()).toBe(true);
        expect(ai.isImageGenerationConfigured()).toBe(false);
    });

    it('is ready once a model with image generation is registered', async () => {
        await seedTextOnlyRegistry();
        const models = await import('../services/models/index.js');
        models.addModel({
            id: 'vendor/imagen',
            provider: models.PROVIDERS.OPENROUTER,
            capabilities: { imageGeneration: true }
        });
        const ai = await import('../services/ai/index.js');
        expect(ai.isImageGenerationConfigured()).toBe(true);
    });

    it('is not ready when the only image model has no provider configured', async () => {
        vi.resetModules();
        localStorage.removeItem('oc_k_or');
        const models = await import('../services/models/index.js');
        models.addModel({
            id: 'vendor/imagen',
            provider: models.PROVIDERS.OPENROUTER,
            capabilities: { imageGeneration: true }
        });
        const ai = await import('../services/ai/index.js');
        expect(ai.isImageGenerationConfigured()).toBe(false);
    });

    it('exposes the image-missing state to the canvas', async () => {
        const { AGENT_STATES } = await import('../features/workspace/hooks/useAgentRun.js');
        expect(AGENT_STATES.IMAGE_MODEL_MISSING).toBe('image_model_missing');
        expect(AGENT_STATES.NOT_CONFIGURED).toBe('not_configured');
    });
});