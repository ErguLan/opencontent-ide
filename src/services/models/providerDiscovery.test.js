import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { discoverProviderModels } from './providerDiscovery.js';

function jsonResponse(payload, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => payload
    };
}

describe('discoverProviderModels', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('reports an unsupported provider instead of inventing a list', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const result = await discoverProviderModels({ provider: 'custom', apiKey: 'key', baseUrl: 'https://gateway.example/v1' });

        expect(result.supported).toBe(false);
        expect(result.reason).toBe('PROVIDER_NOT_LISTABLE');
        expect(result.models).toEqual([]);
        expect(result.error).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('reports an unknown provider as unsupported without touching the network', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const result = await discoverProviderModels({ provider: 'not-a-provider' });

        expect(result.supported).toBe(false);
        expect(result.reason).toBe('PROVIDER_NOT_LISTABLE');
        expect(result.models).toEqual([]);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('reports a missing key as unsupported instead of failing', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const result = await discoverProviderModels({ provider: 'openai', apiKey: '' });

        expect(result.supported).toBe(false);
        expect(result.reason).toBe('API_KEY_REQUIRED');
        expect(result.models).toEqual([]);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('normalizes the raw OpenAI shape into the discovery shape', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
            data: [
                { id: 'gpt-owned', owned_by: 'openai' },
                { id: 'gpt-unowned' },
                { owned_by: 'openai' }
            ]
        })));

        const result = await discoverProviderModels({ provider: 'openai', apiKey: 'sk-user-key' });

        expect(result.supported).toBe(true);
        expect(result.error).toBeNull();
        expect(result.models).toEqual([
            {
                id: 'gpt-owned',
                label: 'openai · gpt-owned',
                ownedBy: 'openai',
                contextHint: null,
                capabilitiesHint: 'CAPABILITIES_UNKNOWN',
                capabilitiesReported: false,
                inputModalities: null,
                outputModalities: null,
                reportedCapabilities: null,
                supportedGenerationMethods: null
            },
            {
                id: 'gpt-unowned',
                label: 'openai · gpt-unowned',
                ownedBy: null,
                contextHint: null,
                capabilitiesHint: 'CAPABILITIES_UNKNOWN',
                capabilitiesReported: false,
                inputModalities: null,
                outputModalities: null,
                reportedCapabilities: null,
                supportedGenerationMethods: null
            }
        ]);
    });

    it('keeps real capability and context data reported by the provider', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
            data: [
                {
                    id: 'vendor/visual-model',
                    name: 'Visual Model',
                    context_length: 128000,
                    architecture: { input_modalities: ['text', 'image'], output_modalities: ['text', 'image'] }
                },
                {
                    id: 'vendor/plain-model',
                    name: 'Plain Model',
                    context_length: 8192,
                    architecture: { modality: 'text->text' }
                }
            ]
        })));

        const result = await discoverProviderModels({ provider: 'openrouter', apiKey: 'sk-or-user-key' });

        expect(result.models).toHaveLength(2);
        expect(result.models[0]).toMatchObject({
            id: 'vendor/visual-model',
            label: 'openrouter · Visual Model',
            ownedBy: 'vendor',
            contextHint: 128000,
            capabilitiesHint: null,
            capabilitiesReported: true,
            inputModalities: ['text', 'image'],
            outputModalities: ['text', 'image']
        });
        expect(result.models[1]).toMatchObject({
            id: 'vendor/plain-model',
            contextHint: 8192,
            capabilitiesHint: 'CAPABILITIES_UNKNOWN',
            capabilitiesReported: false
        });
    });

    it('does not hide models the account has, including ones without image support', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
            models: [
                { name: 'models/embed-model', displayName: 'Embed', inputTokenLimit: 2048 },
                { name: 'models/chat-model', displayName: 'Chat', inputTokenLimit: 1000000 }
            ]
        })));

        const result = await discoverProviderModels({ provider: 'google', apiKey: 'user-key' });

        expect(result.supported).toBe(true);
        expect(result.models.map((model) => model.id)).toEqual(['embed-model', 'chat-model']);
        expect(result.models[0].label).toBe('google · Embed');
        expect(result.models[0].contextHint).toBe(2048);
        expect(result.models[0].ownedBy).toBeNull();
        expect(result.models[0].capabilitiesHint).toBe('CAPABILITIES_UNKNOWN');
    });

    it('turns a 401 into a clear error without guessing why it was rejected', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: { message: 'Invalid credentials' } }, 401)));

        const result = await discoverProviderModels({ provider: 'openai', apiKey: 'wrong-key' });

        expect(result.supported).toBe(true);
        expect(result.models).toEqual([]);
        expect(result.error.code).toBe('PROVIDER_LIST_UNAUTHORIZED');
        expect(result.error.status).toBe(401);
        expect(result.error.detail).toContain('Invalid credentials');
    });

    it('maps 429 to a rate limit error', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: { message: 'slow down' } }, 429)));

        const result = await discoverProviderModels({ provider: 'openai', apiKey: 'key' });

        expect(result.error.code).toBe('PROVIDER_LIST_RATE_LIMITED');
        expect(result.error.status).toBe(429);
    });

    it('maps a network failure to a network error', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Failed to fetch'); }));

        const result = await discoverProviderModels({ provider: 'openai', apiKey: 'key' });

        expect(result.supported).toBe(true);
        expect(result.error.code).toBe('PROVIDER_LIST_NETWORK_ERROR');
    });

    it('passes the caller signal down to the provider request', async () => {
        const fetchMock = vi.fn(async (_url, _options) => jsonResponse({ data: [] }));
        vi.stubGlobal('fetch', fetchMock);
        const controller = new AbortController();

        await discoverProviderModels({ provider: 'openai', apiKey: 'key', signal: controller.signal });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0][0]).toBe('https://api.openai.com/v1/models');
        expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    });
});
