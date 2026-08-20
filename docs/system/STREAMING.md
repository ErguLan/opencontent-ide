# Streaming System

## Overview

Streaming allows the AI response to appear **character by character** as it's generated, rather than all at once after completion. This provides a better user experience, especially for long responses.

## Architecture

The streaming system has three layers:

```
1. Provider → SSE parser → chunks
2. AI Service → passes onChunk callback
3. UI Hook → updates displayedText reactively
```

## Provider Layer (`src/services/providers/streaming.js`)

### `readOpenAIStream(response)`

An **async generator** that parses a fetch `Response` body as Server-Sent Events (SSE):

```
data: {"choices":[{"delta":{"content":"Hello"}}]}
data: {"choices":[{"delta":{"content":" world"}}]}
data: [DONE]
```

Yields the `delta.content` string for each chunk.

### `createStreamAccumulator()`

A helper that accumulates chunks into the full response:

```js
const acc = createStreamAccumulator();
acc.append("Hello");   // → "Hello"
acc.append(" world");  // → "Hello world"
acc.getContent();      // → "Hello world"
```

## Provider Integration

In `openrouter.js` and `openai.js`:

```js
export async function send(prompt, model, options = {}) {
    const stream = Boolean(options.stream);
    const body = { model, messages, stream, ... };

    const response = await fetch(url, { method: 'POST', body: JSON.stringify(body) });

    if (stream) {
        const accumulator = createStreamAccumulator();
        for await (const chunk of readOpenAIStream(response)) {
            accumulator.append(chunk);
            options.onChunk?.(chunk, accumulator.getContent());
        }
        return { success: true, content: accumulator.getContent(), model };
    }

    // Non-streaming: normal JSON parse
    const data = await response.json();
    return { success: true, content: data.choices[0].message.content, model };
}
```

## UI Layer (`useWorkspaceAI.js`)

The hook checks `isStreamingEnabled()` from localStorage and passes `stream` + `onChunk` to `sendToAI`:

```js
const stream = isStreamingEnabled();
wasStreamedRef.current = stream;
const response = await sendToAI(fullPrompt, selectedTextModel, {
    stream,
    onChunk: stream ? (_chunk, accumulated) => setDisplayedText(accumulated) : undefined
});
```

When streaming is active:
- `setDisplayedText(accumulated)` is called on every chunk
- The typewriter effect is **skipped** after the response (text is already displayed)
- `wasStreamedRef.current` prevents double-rendering

## Enabling Streaming

Streaming is opt-in via a localStorage flag:

```js
import { isStreamingEnabled, setStreamingEnabled } from '../../services/ai';

setStreamingEnabled(true);  // Enable
setStreamingEnabled(false); // Disable
```

It defaults to **disabled**. Users enable it in Settings or via the CLI (`streaming on`).

## Supported Providers

| Provider | Streaming | Notes |
|----------|-----------|-------|
| OpenRouter | Yes | OpenAI-compatible SSE |
| OpenAI | Yes | OpenAI-compatible SSE |
| Google Gemini | No | Uses non-streaming fallback |
| Anthropic Claude | No | Uses non-streaming fallback |
| Ollama | No | Uses non-streaming fallback |
