# AI Provider System

## Architecture

The AI provider system is a **unified dispatch layer** that routes requests to the appropriate provider module based on the model's `provider` field.

```
User Request
    ↓
sendToAI(prompt, modelId, options)  ← src/services/ai/index.js
    ↓
resolveModel(modelId)               ← src/services/models/index.js
    ↓
getProviderModule(provider)         ← maps provider string → module
    ↓
provider.send(prompt, model, opts)  ← e.g. openrouter.js, openai.js, etc.
```

## Provider Interface

Every provider module must export these functions:

### `send(prompt, model, options)`
**Purpose:** Generate text/chat completion.

| Param | Type | Description |
|-------|------|-------------|
| `prompt` | `string` | The user's prompt |
| `model` | `string` | Model ID registered by the user |
| `options` | `object` | Optional: `systemPrompt`, `imageUrl`, `imageUrls`, `signal`, `stream`, `onChunk`, `temperature`, `maxTokens`, `responseFormat` |

**Returns:** `{ success: boolean, content?: string, model?: string, usage?: object, error?: string }`

**Streaming support:** When `options.stream === true`, the provider reads SSE chunks via `readOpenAIStream()` and calls `options.onChunk(chunk, accumulated)` for each fragment. The final result still returns as a complete `{ success, content }` object.

### `generateImage(prompt, model, options)`
**Purpose:** Generate an image.

| Param | Type | Description |
|-------|------|-------------|
| `prompt` | `string` | Image description |
| `model` | `string` | Image model ID registered by the user |
| `options` | `object` | Optional: `signal`, `size` |

**Returns:** `{ success: boolean, imageUrl?: string, model?: string, error?: string }`

### `analyzeImage(imageUrl, prompt, options)`
**Purpose:** Analyze/describe an image using vision capabilities.

| Param | Type | Description |
|-------|------|-------------|
| `imageUrl` | `string` | URL or base64 of the image |
| `prompt` | `string` | Analysis instruction |
| `options` | `object` | Optional: `signal`, `visionModel` |

**Returns:** `{ success: boolean, analysis?: string, model?: string, error?: string }`

## Streaming (`src/services/providers/streaming.js`)

```js
readOpenAIStream(response)  →  AsyncGenerator<string>
createStreamAccumulator()   →  { append(chunk): string, getContent(): string }
```

`readOpenAIStream` parses a `fetch` Response body as Server-Sent Events (SSE). It yields `delta.content` strings as they arrive.

`createStreamAccumulator` builds the full response incrementally.

Only OpenRouter and OpenAI currently support streaming. Google, Anthropic, and Ollama use non-streaming fallback.

## Error Handling

All providers use `normalizeError()` from `shared.js` to convert API errors into consistent messages:

| Error Message | Meaning |
|---------------|---------|
| `API_KEY_NOT_CONFIGURED` | No API key found for the provider |
| `REQUEST_TIMEOUT` | Fetch exceeded timeout |
| `REQUEST_ABORTED` | User cancelled the request |
| `NO_IMAGE_IN_RESPONSE` | Image generation returned no image |
| `CONNECTION_FAILED` | Ollama is not running |

## Adding a New Provider

```js
// 1. Create src/services/providers/yourprovider.js
export async function send(prompt, model, options = {}) { /* ... */ }
export async function generateImage(prompt, model, options = {}) { /* ... */ }
export async function analyzeImage(imageUrl, prompt, options = {}) { /* ... */ }

// 2. Add to PROVIDERS enum in src/services/models/index.js
PROVIDERS.YOUR_PROVIDER = 'yourprovider';

// 3. Import and map in src/services/ai/index.js
import * as yourprovider from '../providers/yourprovider.js';

const PROVIDER_MODULES = {
    [PROVIDERS.OPENROUTER]: openrouter,
    [PROVIDERS.OPENAI]: openai,
    [PROVIDERS.GOOGLE]: google,
    [PROVIDERS.ANTHROPIC]: anthropic,
    [PROVIDERS.OLLAMA]: ollama,
    [PROVIDERS.YOUR_PROVIDER]: yourprovider,  // ← add here
};
```
