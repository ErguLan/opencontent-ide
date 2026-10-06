# Model Registry (`src/services/models/index.js`)

## Purpose

A **user-owned list of AI models** with metadata (provider, type, capabilities, nickname, optional `baseUrl`). All entries live in `localStorage` under `oc_models`.

There are no built-in defaults. The registry starts empty, the app never adds a vendor model ID on the user's behalf, and `isBuiltIn` is always `false`. `TEXT_MODEL_CATALOG` and `IMAGE_MODEL_CATALOG` in `src/services/ai/index.js` are empty arrays and are not a source of models.

## Data Structure

```js
{
    id: "<user-model-id>",            // Required, unique.
    nickname: "<display-name>",       // Defaults to id.
    provider: "openai",               // openrouter | openai | google | anthropic | ollama | custom
    type: "text" | "image" | "vision" | "multimodal",
    capabilities: {
        text: true,                    // Can generate text
        imageGeneration: false,        // Can generate images
        vision: false,                 // Can analyze images
        toolCalling: false,            // Supports native tools
        imageEditing: false            // Supports image edits
    },
    baseUrl: "",                       // Required for provider "custom"
    requestFormat: "openai-compatible",
    isBuiltIn: false                   // Always false.
}
```

## API

| Function | Behavior |
|----------|----------|
| `getStoredModels()` | All models, or `[]`. Malformed storage is treated as empty rather than throwing. |
| `saveModels(models)` | Persists the whole array. |
| `addModel(model)` | Validates, then appends. |
| `removeModel(id)` | Removes by ID. |
| `updateModel(id, updates)` | Shallow partial update. Returns `null` for an unknown ID. |
| `getModelById(id)` | Exact lookup. |
| `getTextModels()` / `getImageModels()` / `getVisionModels()` | Filter by capability. |
| `resolveModel(id)` | Lookup with an unconfigured fallback. See below. |
| `supportsVision(id)` / `supportsImageGeneration(id)` / `supportsToolCalling(id)` / `supportsImageEditing(id)` | Capability checks through `resolveModel`. |
| `addModelsFromDiscovery(entries, options)` | Batch registration from discovery. See below. |

### `addModel` validation

- `id` is required and trimmed.
- `provider` is required and must be one of `PROVIDERS`.
- `provider: 'custom'` additionally requires `baseUrl`.
- An ID already in the registry throws `Model <id> already exists`; it is never overwritten.
- Unspecified capabilities default to `false`. Nothing is inferred from the model name.

### `resolveModel(id)` — unknown IDs stay unconfigured

This is the deliberate core of the design, not a gap.

```js
resolveModel('some-id-the-user-never-registered')
// {
//   id: 'some-id-the-user-never-registered',
//   nickname: 'some-id-the-user-never-registered',
//   provider: null,
//   type: 'text',
//   capabilities: { text: false, imageGeneration: false,
//                   vision: false, toolCalling: false, imageEditing: false },
//   isBuiltIn: false
// }
```

An empty ID resolves to the same shape with `id: ''`.

There is **no fallback model and no default provider**. A missing or stale ID therefore produces `provider: null`, every capability `false`, and dispatch stops at `PROVIDER_NOT_SUPPORTED` / `TEXT_MODEL_NOT_SUPPORTED` before any network call. The workspace surfaces that as "not configured" and routes to `/setup`.

Why this matters: a fallback would silently route a request to a vendor account the user did not choose, spend their credits, and possibly answer with a model that does not exist. Failing loudly costs one click. `src/services/ai/modelSelection.test.js` locks this behavior.

## Model Discovery

`src/services/models/providerDiscovery.js` asks the user's own provider which models their own key can reach. Implementation, endpoints and error codes are in `docs/system/AI_PROVIDERS.md`.

```js
const result = await discoverProviderModels({ provider, apiKey, baseUrl, signal, timeoutMs });
// { provider, supported, reason, models, error }
```

A provider that cannot be listed returns `{ supported: false, reason, models: [] }`. It is never replaced with a bundled list.

### `addModelsFromDiscovery(entries, options)`

```js
const { added, skipped } = addModelsFromDiscovery(
    ['model-a', 'model-b'],
    {
        provider: 'openrouter',
        baseUrl: '',
        type: 'text',
        capabilities: { text: true, vision: true }
    }
);
```

Rules, each with a reason:

- **At least one explicit capability is required**, else `MODEL_CAPABILITIES_REQUIRED`. Discovery proves a model *exists* on the account; it does not prove what the model can do. Capabilities stay a human decision.
- **A valid `provider` is required**, else `MODEL_PROVIDER_REQUIRED`. `provider: 'custom'` additionally needs `baseUrl`, else `MODEL_BASE_URL_REQUIRED`.
- **Duplicates are skipped, never overwritten.** An ID already in the registry, or repeated inside the batch, is reported in `skipped`.
- **`isBuiltIn: false` always.** Nothing written here is bundled with the app.
- The write happens once, only if at least one model was added.

### Setup flow

`src/features/setup/AISetupPage.jsx` is the three-step onboarding: choose provider, paste the credential, discover and choose a model. Discovery is a read; registration is a separate, explicit action.

## Selections

Selected model IDs are stored per capability in `localStorage`:

| Storage key | Capability |
|-------------|------------|
| `oc_selected_text_model` | `capabilities.text` |
| `oc_selected_vision_model` | `capabilities.vision` |
| `oc_selected_image_model` | `capabilities.imageGeneration` |

`getActiveTextModel()`, `getActiveImageModel()` and `getActiveVisionModel()` go through `getValidSelection(storageKey, capability)`: they read the stored ID, find it in the current registry, and clear the key and return `null` if it is missing or lacks the capability. An empty result means "unselected", never "fall back to something".

## The never-auto-select invariant

The workspace must never activate a model the user did not choose.

- `getTextModelOptions()` and friends prepend an explicit unselected placeholder.
- `composeSelectableOptions()` (`src/features/workspace/utils/modelSelection.js`) finds that placeholder by its `isPlaceholder` marker (or an empty id), never by its position in the list, then places it first. Reordering the registry cannot therefore cause the first entry to be activated.
- `resolveSelection()` clears an invalid stored selection instead of substituting another one.
- `addModel` / `addModelsFromDiscovery` never set a selection.

`src/services/ai/modelSelection.test.js` covers all of it. Keep it green.

## Constants

```js
PROVIDERS = {
    OPENROUTER: 'openrouter',
    OPENAI: 'openai',
    GOOGLE: 'google',
    ANTHROPIC: 'anthropic',
    OLLAMA: 'ollama',
    CUSTOM: 'custom'
}

MODEL_TYPES = {
    TEXT: 'text',
    IMAGE: 'image',
    VISION: 'vision',
    MULTIMODAL: 'multimodal'
}
```

## Flow: How a Model ID Becomes a Provider Call

```
1. User registers and selects a model at /setup or in Settings
   → localStorage.setItem('oc_models', '[…]')
   → localStorage.setItem('oc_selected_text_model', '<user-model-id>')

2. User submits a prompt
   → getActiveTextModel() → '<user-model-id>'

3. sendToAI(prompt, '<user-model-id>', options)
   → resolveModel('<user-model-id>')      finds the user-defined entry
   → getProviderModule(model.provider)
   → provider.send(prompt, model.id, options)
```