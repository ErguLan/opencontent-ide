# AI Provider System

## Architecture

The AI provider system is a **unified dispatch layer** that routes requests to the provider module named by the model registry entry.

```
User Request
    ↓
sendToAI(prompt, modelId, options)   ← src/services/ai/index.js
    ↓
resolveModel(modelId)                ← src/services/models/index.js
    ↓
getProviderModule(provider)          ← maps the provider string to a module
    ↓
provider.send(prompt, model.id, opts) ← openrouter.js | openai.js | google.js
                                     ← anthropic.js | ollama.js | custom.js
```

`sendToAI`, `analyzeImage` and `generateImage` each fail fast, in order, when: no model is selected, the resolved model lacks the capability (`TEXT_MODEL_NOT_SELECTED`, `TEXT_MODEL_NOT_SUPPORTED`, `VISION_MODEL_NOT_SELECTED`, `VISION_MODEL_NOT_SUPPORTED`, `IMAGE_MODEL_NOT_SELECTED`, `IMAGE_GENERATION_NOT_SUPPORTED`), the provider is unknown (`PROVIDER_NOT_SUPPORTED`) or the provider has no credential (`PROVIDER_NOT_CONFIGURED`). An unresolved model ID never reaches a provider, because `resolveModel` returns `provider: null`.

## Provider Interface

Every provider module exports these functions. `listModels` is optional: a provider without it simply is not listable, and discovery reports that.

### `send(prompt, model, options)`

| Param | Type | Description |
|-------|------|-------------|
| `prompt` | `string` | The user's prompt |
| `model` | `string` | Model ID registered by the user |
| `options` | `object` | `systemPrompt`, `imageUrl`, `imageUrls`, `signal`, `stream`, `onChunk`, `temperature`, `maxTokens`, `tools`, `toolChoice`, `parallelToolCalls`, `toolContext` |

**Returns:** `{ success: boolean, content?: string, model?: string, usage?: object, error?: string }`

Vision input is encoded as OpenAI-style `image_url` content parts (`buildMessages` in `openai.js`), which is why image-bearing requests go through OpenAI-compatible modules.

### `generateImage(prompt, model, options)`

**Returns:** `{ success: boolean, imageUrl?: string, model?: string, error?: string }`

### `analyzeImage(imageUrl, prompt, options)`

**Returns:** `{ success: boolean, analysis?: string, model?: string, error?: string }`

Requires `options.visionModel`; without it, `VISION_MODEL_NOT_SELECTED`.

### `listModels({ apiKey, baseUrl, signal })`

See Model Discovery below. Returns `{ success: true, models }` or `{ success: false, error, status }`.

## Model Discovery

`src/services/models/providerDiscovery.js`:

```js
discoverProviderModels({ provider, apiKey, baseUrl, signal, timeoutMs })
```

It asks **the user's own provider**, using **the user's own key**, which models that account can reach. It is not a bundled catalogue and it does not consult one.

| Provider | Endpoint | Detail |
|----------|----------|--------|
| OpenAI | `GET /models` | Single page |
| OpenRouter | `GET /models` | Single page |
| Google | `GET /v1beta/models?key=…&pageSize=1000` | Single page |
| Anthropic | `GET /v1/models?limit=…&after_id=…` | Cursor pagination, `has_more`/`last_id`, capped at 10 pages |
| Ollama | `GET /api/tags` | Single page; no API key |

Default timeout is 20 s (`DISCOVERY_TIMEOUT_MS`), implemented as a linked `AbortController` so a caller signal and the timeout both cancel the request.

### Result shape

```js
// provider cannot be listed at all
{ provider, supported: false, reason, models: [], error: null }

// success (models may legitimately be empty)
{ provider, supported: true,  reason: null, models, error: null }

// failure the caller may want to explain
{ provider, supported: true,  reason: null, models: [], error: { code, status, detail } }
```

`reason` values: `PROVIDER_NOT_LISTABLE`, `API_KEY_REQUIRED`, `BASE_URL_REQUIRED`. A provider that cannot be listed is reported as unsupported; it is never replaced with a bundled list, and a failure never throws.

### Error codes

| Code | Raised when |
|------|-------------|
| `PROVIDER_LIST_UNAUTHORIZED` | HTTP 401 **or** 403. Both map to one code on purpose: to the user they are the same situation, their key is not accepted. |
| `PROVIDER_LIST_RATE_LIMITED` | HTTP 429 |
| `PROVIDER_LIST_PROVIDER_DOWN` | HTTP 5xx |
| `PROVIDER_LIST_FAILED` | Any other non-ok HTTP status |
| `PROVIDER_LIST_NETWORK_ERROR` | Fetch failed with no status |
| `PROVIDER_LIST_TIMEOUT` | Provider reported `REQUEST_TIMEOUT` |
| `PROVIDER_LIST_ABORTED` | Provider reported `REQUEST_ABORTED`, i.e. the caller aborted |

### What the UI receives

`normalizeEntry` turns each provider entry into `{ id, label, ownedBy, contextHint, capabilitiesHint, capabilitiesReported, inputModalities, outputModalities }`.

- Nothing is filtered and nothing is reordered to hide anything. The user sees exactly what their account reports.
- An absent field stays `null`. `ownedBy`, `contextHint` and the modality arrays are only populated from the API payload.
- When the API reports no modalities at all, `capabilitiesHint` is set to the literal `CAPABILITIES_UNKNOWN` and `capabilitiesReported` is `false`. Capabilities are then a user decision, not an inference.
- `label` is presentation only (`<provider> · <displayName>` or `<provider> · <id>`).
- Duplicate IDs inside one response are dropped.

## Credentials

Provider keys are read in this order: the explicit `config.apiKey` argument, then `localStorage` under `oc_k_*`, then the optional `import.meta.env.VITE_*` fallback.

| Provider | localStorage key | Env fallback read by `AI_CONFIG` |
|----------|------------------|-----------------------------------|
| OpenRouter | `oc_k_or` | `VITE_OPENROUTER_API_KEY` |
| OpenAI | `oc_k_oa` | `VITE_OPENAI_API_KEY` |
| Google | `oc_k_gm` | `VITE_GEMINI_API_KEY` or `VITE_GOOGLE_API_KEY` |
| Anthropic | `oc_k_an` | `VITE_ANTHROPIC_API_KEY` |
| Custom | `oc_k_custom` | `VITE_CUSTOM_API_KEY` |
| Ollama | `oc_ollama_url` | `VITE_OLLAMA_BASE_URL` (default `http://localhost:11434`) |

`oc_k_*` is the real storage. The env variables are an optional convenience for self-hosted deployments, not the normal path. Note that `providers/google.js` itself only reads `VITE_GEMINI_API_KEY`; the `VITE_GOOGLE_API_KEY` alias is accepted by the dispatch layer in `AI_CONFIG`.

`isAIConfigured()` is deliberately stricter than "is there a key somewhere": it returns `true` only when a **registered model** has `capabilities.text` and its provider resolves to a credential. A key in `localStorage` with no registered model does not count, so the workspace never offers to run against a model the user has not declared. `isOllamaConfigured()` applies the same rule for Ollama.

## Streaming

`src/services/providers/streaming.js`:

```js
readOpenAIStream(response)  → AsyncGenerator<string>
createStreamAccumulator()   → { append(chunk): string, getContent(): string }
```

OpenRouter and OpenAI stream. Google, Anthropic, Ollama and custom do not. Details and who actually streams are in `docs/system/STREAMING.md`.

## Error Handling

Providers normalize thrown errors through `shared.js`:

| Error | Meaning |
|-------|---------|
| `API_KEY_NOT_CONFIGURED` | No key for the provider |
| `BASE_URL_NOT_CONFIGURED` | A base URL is required and absent |
| `REQUEST_TIMEOUT` | Fetch exceeded the timeout |
| `REQUEST_ABORTED` | The caller aborted |
| `NO_IMAGE_IN_RESPONSE` | Image generation returned no image |
| `IMAGE_GENERATION_NOT_SUPPORTED` | Provider has no image endpoint |
| `VISION_MODEL_NOT_SELECTED` | No vision model |
| `CONNECTION_FAILED` | Ollama is not reachable |

OpenRouter and OpenAI retry on HTTP 429 with exponential backoff (3 retries, 2 s base).

## Adding a Provider

1. Create `src/services/providers/yourprovider.js` exporting `send`, `generateImage`, `analyzeImage`, and optionally `listModels`.
2. Add the key to `PROVIDERS` in `src/services/models/index.js`.
3. Add an `oc_k_*` entry in `LS_KEYS` in `src/services/ai/index.js` and a getter on `AI_CONFIG`.
4. Map the provider to the module in `getProviderModule()` and to its key in the key-lookup switch, both in `src/services/ai/index.js`.
5. If the provider is listable, export `listModels` and add the module to `LISTING_PROVIDERS` in `providerDiscovery.js`.

Step 5 is optional. If you skip it, discovery returns `{ supported: false, reason: 'PROVIDER_NOT_LISTABLE' }` for that provider, which is the correct and intended behavior — never register a fake listing.