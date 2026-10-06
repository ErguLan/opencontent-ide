/**
 * Provider model discovery
 * OpenContent IDE
 *
 * Asks the user's own provider which models their own key can reach.
 * This never injects vendor model IDs: when a provider cannot list models,
 * the result is reported as unsupported instead of being replaced by a
 * bundled list. Nothing is filtered out either, so the user sees exactly
 * what their account has; unknown capabilities are marked, never guessed.
 */

import { PROVIDERS } from './index.js';
import * as anthropicProvider from '../providers/anthropic.js';
import * as googleProvider from '../providers/google.js';
import * as ollamaProvider from '../providers/ollama.js';
import * as openaiProvider from '../providers/openai.js';
import * as openrouterProvider from '../providers/openrouter.js';

export const DISCOVERY_TIMEOUT_MS = 20000;

/**
 * The capability flags the registry understands, in registry order. Detection
 * only ever turns a flag on; turning one off is always a human decision.
 */
export const CAPABILITY_FIELDS = ['text', 'vision', 'imageGeneration', 'toolCalling', 'imageEditing'];

// Google declares which generation methods exist on a model. Only the ones
// that produce generated content can assert text output; the list endpoint
// declares no modalities, so nothing about vision or images is claimed.
const GOOGLE_GENERATION_METHODS = ['generatecontent', 'batchgeneratecontent', 'streamgeneratecontent'];

const LISTING_PROVIDERS = {
    [PROVIDERS.ANTHROPIC]: anthropicProvider,
    [PROVIDERS.GOOGLE]: googleProvider,
    [PROVIDERS.OLLAMA]: ollamaProvider,
    [PROVIDERS.OPENAI]: openaiProvider,
    [PROVIDERS.OPENROUTER]: openrouterProvider
};

const UNSUPPORTED_REASONS = new Set([
    'API_KEY_REQUIRED',
    'BASE_URL_REQUIRED',
    'PROVIDER_NOT_LISTABLE'
]);

function createLinkedSignal(signal, timeoutMs) {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    if (signal?.aborted) controller.abort();
    else signal?.addEventListener('abort', onAbort);
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return {
        signal: controller.signal,
        dispose() {
            clearTimeout(timer);
            if (signal && !signal.aborted) signal.removeEventListener('abort', onAbort);
        }
    };
}

function classifyStatus(status) {
    if (status === 401 || status === 403) return 'PROVIDER_LIST_UNAUTHORIZED';
    if (status === 429) return 'PROVIDER_LIST_RATE_LIMITED';
    if (status >= 500) return 'PROVIDER_LIST_PROVIDER_DOWN';
    return 'PROVIDER_LIST_FAILED';
}

function toError(result) {
    const raw = typeof result === 'string'
        ? result
        : (typeof result?.error === 'string' ? result.error : (result?.error?.message || ''));
    const status = Number.isFinite(result?.status) ? result.status : null;
    let code = 'PROVIDER_LIST_NETWORK_ERROR';
    if (status) code = classifyStatus(status);
    else if (raw === 'REQUEST_TIMEOUT') code = 'PROVIDER_LIST_TIMEOUT';
    else if (raw === 'REQUEST_ABORTED') code = 'PROVIDER_LIST_ABORTED';
    return { code, status, detail: raw };
}

/**
 * Turns a provider entry into the shape the UI consumes.
 * `label` is presentation only. `ownedBy`, `contextHint` and the modality
 * flags come from the API payload, so an absent value stays null instead of
 * being filled with a guess. `supportedGenerationMethods` is Google's own
 * field and `reportedCapabilities` is what Ollama's `/api/show` returns;
 * both are optional and stay absent when the provider did not send them.
 */
function normalizeEntry(provider, entry) {
    const raw = typeof entry === 'string' ? { id: entry } : (entry || {});
    const id = typeof raw.id === 'string' ? raw.id.trim() : '';
    if (!id) return null;
    const displayName = typeof raw.displayName === 'string' && raw.displayName.trim()
        ? raw.displayName.trim()
        : null;
    const ownedBy = typeof raw.ownedBy === 'string' && raw.ownedBy.trim() ? raw.ownedBy.trim() : null;
    const inputModalities = Array.isArray(raw.inputModalities)
        ? raw.inputModalities.filter((value) => typeof value === 'string' && value.trim())
        : null;
    const outputModalities = Array.isArray(raw.outputModalities)
        ? raw.outputModalities.filter((value) => typeof value === 'string' && value.trim())
        : null;
    const supportedGenerationMethods = Array.isArray(raw.supportedGenerationMethods)
        ? raw.supportedGenerationMethods.filter((value) => typeof value === 'string' && value.trim())
        : null;
    const reportedCapabilities = Array.isArray(raw.capabilities)
        ? raw.capabilities.filter((value) => typeof value === 'string' && value.trim())
        : null;
    const capabilitiesReported = Boolean(
        (inputModalities && inputModalities.length > 0)
        || (outputModalities && outputModalities.length > 0)
        || (supportedGenerationMethods && supportedGenerationMethods.length > 0)
        || (reportedCapabilities && reportedCapabilities.length > 0)
    );
    return {
        id,
        label: displayName && displayName !== id ? `${provider} · ${displayName}` : `${provider} · ${id}`,
        ownedBy,
        contextHint: Number.isFinite(raw.contextWindow) ? raw.contextWindow : null,
        capabilitiesHint: capabilitiesReported ? null : 'CAPABILITIES_UNKNOWN',
        capabilitiesReported,
        inputModalities: inputModalities && inputModalities.length > 0 ? inputModalities : null,
        outputModalities: outputModalities && outputModalities.length > 0 ? outputModalities : null,
        supportedGenerationMethods: supportedGenerationMethods && supportedGenerationMethods.length > 0
            ? supportedGenerationMethods
            : null,
        reportedCapabilities: reportedCapabilities && reportedCapabilities.length > 0
            ? reportedCapabilities
            : null
    };
}

function normalizeList(provider, entries) {
    const models = [];
    const seen = new Set();
    for (const entry of Array.isArray(entries) ? entries : []) {
        const normalized = normalizeEntry(provider, entry);
        if (!normalized || seen.has(normalized.id)) continue;
        seen.add(normalized.id);
        models.push(normalized);
    }
    return models;
}

function emptyCapabilities() {
    return CAPABILITY_FIELDS.reduce((acc, key) => ({ ...acc, [key]: false }), {});
}

function toTokenSet(value) {
    const tokens = new Set();
    for (const item of Array.isArray(value) ? value : []) {
        if (typeof item === 'string' && item.trim()) tokens.add(item.trim().toLowerCase());
    }
    return tokens;
}

/**
 * Reads the capabilities a provider actually reported about one model.
 *
 * Pure and side-effect free: it never contacts anything and never falls back
 * to a bundled catalog. Every flag it turns on is backed by a field the
 * provider sent for that model:
 *
 *   - OpenRouter `architecture.input_modalities` / `output_modalities`
 *   - Google `supportedGenerationMethods`
 *   - Ollama `capabilities` from `/api/show`
 *
 * `source` is `'provider'` only when at least one flag could be asserted from
 * that payload. Otherwise it is `'unknown'` and every flag is false, which is
 * the honest answer for OpenAI and Anthropic (their `/v1/models` carries no
 * capability data at all), for embedding-only models, and for modalities this
 * app has no capability for such as audio. The caller decides what to mark.
 */
export function detectCapabilities(entry) {
    const capabilities = emptyCapabilities();
    if (!entry || typeof entry !== 'object') return { capabilities, source: 'unknown' };

    const input = toTokenSet(entry.inputModalities);
    const output = toTokenSet(entry.outputModalities);
    const methods = toTokenSet(entry.supportedGenerationMethods);
    const reported = toTokenSet(entry.reportedCapabilities);
    let detected = false;

    if (output.has('image')) {
        capabilities.imageGeneration = true;
        detected = true;
    }
    if (input.has('image')) {
        capabilities.vision = true;
        detected = true;
    }
    if (input.has('text') || output.has('text')) {
        capabilities.text = true;
        detected = true;
    }

    if (reported.has('completion') || reported.has('insert')) {
        capabilities.text = true;
        detected = true;
    }
    if (reported.has('vision')) {
        capabilities.vision = true;
        detected = true;
    }
    if (reported.has('tools')) {
        capabilities.toolCalling = true;
        detected = true;
    }

    if (GOOGLE_GENERATION_METHODS.some((method) => methods.has(method))) {
        capabilities.text = true;
        detected = true;
    }

    return { capabilities, source: detected ? 'provider' : 'unknown' };
}

/**
 * Same rules applied to a whole selection, which is what the setup page
 * registers in one batch.
 *
 * Capabilities are a property of each model, so a batch can only be pre-marked
 * with what every selected model agrees on:
 *   - all reported, all agreeing: the full detection, `conflicting: false`
 *   - all reported, some disagreeing: only the intersection, `conflicting: true`
 *   - any model reported nothing: nothing is pre-marked, because a model that
 *     stayed silent cannot inherit what its neighbours declared
 */
export function detectCapabilitiesForSelection(entries) {
    const list = Array.isArray(entries) ? entries : [];
    const results = list.map((entry) => detectCapabilities(entry));
    const reporting = results.filter((result) => result.source === 'provider');
    const silent = list.length - reporting.length;

    if (reporting.length === 0) {
        return { capabilities: emptyCapabilities(), source: 'unknown', unreported: silent, conflicting: false };
    }
    if (silent > 0) {
        return { capabilities: emptyCapabilities(), source: 'unknown', unreported: silent, conflicting: false };
    }
    const agreed = emptyCapabilities();
    let conflicting = false;
    for (const key of CAPABILITY_FIELDS) {
        const values = reporting.map((result) => Boolean(result.capabilities[key]));
        agreed[key] = values.every(Boolean);
        if (values.some((value) => value !== values[0])) conflicting = true;
    }
    return { capabilities: agreed, source: 'provider', unreported: 0, conflicting };
}

/**
 * Lists the models a provider exposes for the given credentials.
 *
 * Resolves with:
 *   { provider, supported: false, reason, models: [], error: null }
 *       when the provider cannot be listed at all (no module, no key, no URL).
 *   { provider, supported: true, reason: null, models, error: null }
 *       on success. `models` may legitimately be empty.
 *   { provider, supported: true, reason: null, models: [], error }
 *       on failure, where `error` is { code, status, detail } for the UI to
 *       translate. It never throws for network, HTTP or timeout failures.
 */
export async function discoverProviderModels({
    provider,
    apiKey,
    baseUrl,
    signal,
    timeoutMs = DISCOVERY_TIMEOUT_MS
} = {}) {
    const providerId = typeof provider === 'string' ? provider.trim().toLowerCase() : '';
    const providerModule = LISTING_PROVIDERS[providerId];
    if (!providerModule || typeof providerModule.listModels !== 'function') {
        return { provider: providerId || null, supported: false, reason: 'PROVIDER_NOT_LISTABLE', models: [], error: null };
    }

    const linked = createLinkedSignal(signal, Math.max(1, Number(timeoutMs) || DISCOVERY_TIMEOUT_MS));
    try {
        const result = await providerModule.listModels({ apiKey, baseUrl, signal: linked.signal });
        const unsupported = result?.reason;
        if (unsupported && UNSUPPORTED_REASONS.has(unsupported)) {
            return { provider: providerId, supported: false, reason: unsupported, models: [], error: null };
        }
        if (result?.error === 'API_KEY_NOT_CONFIGURED' || result?.error === 'BASE_URL_NOT_CONFIGURED') {
            return {
                provider: providerId,
                supported: false,
                reason: result.error === 'API_KEY_NOT_CONFIGURED' ? 'API_KEY_REQUIRED' : 'BASE_URL_REQUIRED',
                models: [],
                error: null
            };
        }
        if (!result?.success) {
            return { provider: providerId, supported: true, reason: null, models: [], error: toError(result) };
        }
        return {
            provider: providerId,
            supported: true,
            reason: null,
            models: normalizeList(providerId, result.models),
            error: null
        };
    } catch (error) {
        return { provider: providerId, supported: true, reason: null, models: [], error: toError(error) };
    } finally {
        linked.dispose();
    }
}
