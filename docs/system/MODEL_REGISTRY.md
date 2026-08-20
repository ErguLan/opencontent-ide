# Model Registry (`src/services/models/index.js`)

## Purpose

Provides a **user-managed list of AI models** with metadata (provider, capabilities, nickname). All models are stored in `localStorage` under `oc_models`. There are **no built-in defaults** — every model is added by the user.

## Data Structure

```js
{
    id: "<user-model-id>",            // Required. Unique model identifier.
    nickname: "<display-name>",       // Optional. Display name.
    provider: "openai",                // One of: openrouter, openai, google, anthropic, ollama, custom
    type: "text" | "image" | "vision" | "multimodal",
    capabilities: {
        text: true,                    // Can generate text
        imageGeneration: false,        // Can generate images
        vision: false,                 // Can analyze images
        toolCalling: false,             // Supports native tools
        imageEditing: false             // Supports image edits
    },
    isBuiltIn: false                   // Always false; all models are user-added
}
```

## API

### `getStoredModels()`
Returns array of all models from localStorage. If none stored, returns `[]`.

### `saveModels(models)`
Persists the full model array to localStorage.

### `addModel(model)`
Adds a model after validation:
- `id` is required and must be unique
- Generates default `nickname` from `id` if not provided
- Default `capabilities` are all `false` unless specified
- Throws if model ID already exists

### `removeModel(id)`
Removes a model by ID.

### `updateModel(id, updates)`
Partial update of a model's fields.

### `resolveModel(id)`
Looks up a model by ID. Unknown IDs remain unconfigured:
```js
{
    id, nickname: id,
    provider: null,
    type: MODEL_TYPES.TEXT,
    capabilities: { text: false, imageGeneration: false, vision: false }
}
```
The user must register the provider and capabilities before the ID can be used.

### `supportsVision(id)` / `supportsImageGeneration(id)`
Check capabilities by resolving the model ID.

## Flow: How a Model ID Becomes a Provider Call

```
1. User registers and selects a model in Settings
   → localStorage.setItem('oc_selected_text_model', '<user-model-id>')

2. User clicks Generate
   → getActiveTextModel() → '<user-model-id>'

3. sendToAI(prompt, '<user-model-id>')
   → resolveModel('<user-model-id>')
      → finds the user-defined entry in oc_models
   → getProviderModule(model.provider)
   → provider.send(prompt, '<user-model-id>', options)
```

## Constants

```js
PROVIDERS = {
    OPENROUTER: 'openrouter',
    OPENAI: 'openai',
    GOOGLE: 'google',
    ANTHROPIC: 'anthropic',
    OLLAMA: 'ollama'
}

MODEL_TYPES = {
    TEXT: 'text',
    IMAGE: 'image',
    VISION: 'vision',
    MULTIMODAL: 'multimodal'
}
```
