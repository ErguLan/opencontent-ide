# Streaming System

## Overview

Streaming lets a text response appear chunk by chunk as it is generated, instead of only after the request completes.

## Architecture

Three layers:

```
1. Provider module -> streaming.js SSE parser -> chunks
2. AI service      -> forwards options.stream and options.onChunk
3. Workspace hooks -> onChunk updates the displayed text reactively
```

## Provider Layer (`src/services/providers/streaming.js`)

### `readOpenAIStream(response)`

An **async generator** that parses a `fetch` `Response` body as Server-Sent Events:

```
data: {"choices":[{"delta":{"content":"Hello"}}]}
data: {"choices":[{"delta":{"content":" world"}}]}
data: [DONE]
```

It yields each `delta.content` string, stops on `[DONE]`, ignores blank lines and malformed JSON, and releases the reader in a `finally` block.

### `createStreamAccumulator()`

```js
const acc = createStreamAccumulator();
acc.append("Hello");   // -> "Hello"
acc.append(" world");  // -> "Hello world"
acc.getContent();      // -> "Hello world"
```

## Provider Integration

`openrouter.js` and `openai.js` both branch on `options.stream`:

```js
if (stream) {
    const accumulator = createStreamAccumulator();
    for await (const chunk of readOpenAIStream(response)) {
        accumulator.append(chunk);
        options.onChunk?.(chunk, accumulator.getContent());
    }
    return { success: true, content: accumulator.getContent(), model, usage: {} };
}

// Non-streaming: one JSON parse
const data = await response.json();
```

The streaming branch returns the same `{ success, content, model }` shape as the non-streaming branch, so a caller does not branch on how the text arrived. Both `openai.js` and `openrouter.js` also retry on HTTP 429 with exponential backoff (3 retries, 2 s base delay) before falling through.

## Supported Providers

| Provider | Streaming | Notes |
|----------|-----------|-------|
| OpenRouter | Yes | OpenAI-compatible SSE |
| OpenAI | Yes | OpenAI-compatible SSE |
| Google Gemini | No | Non-streaming request |
| Anthropic | No | Non-streaming request |
| Ollama | No | Sends `stream: false` |
| Custom (OpenAI-compatible) | No | Sends `stream: false` |

## Who Actually Streams

This is the part that is easy to get wrong, so it is stated explicitly.

**Agentic text steps stream.** `runTextStep` in `src/services/ai/agenticPipeline.js` sets `stream: true` unconditionally and forwards chunks:

```js
const result = await sendToAI(contextualTaskPrompt, selectedTextModel, {
    systemPrompt: ..., signal, stream: true,
    onChunk: (_chunk, accumulated) => onChunk?.(accumulated)
});
```

**Direct (non-agentic) generation does not stream.** `useWorkspaceGeneration` calls `sendToAI` without `stream`, waits for the complete response and lets the reveal be a presentation effect.

The pipeline's own closing `sendToAI` calls (the native tool loop and the final summary after fallback tool actions) also do not pass `stream`.

## UI Layer

`onChunk` is wired to `agentRun.setDisplayedText`:

| Consumer | Wiring |
|----------|--------|
| `useWorkspaceGeneration` (agentic run) | `onChunk: agentRun.setDisplayedText` |
| `useWorkspaceBatch` | `onChunk: agentRun.setDisplayedText` |
| `features/cli/commands.js` (`agent` command) | `onChunk: () => {}` |

`setDisplayedText` lives in `useAgentRun`; the text is rendered by the canvas.

## The Typewriter Reveal

`useWorkspaceResults` owns the reveal of a completed text result, at a 5 ms interval per character. It only runs when all of the following hold:

- The agent state is `COMPLETE`.
- The current version is of type `text`.
- The version is flagged `isNew`.
- That version index has not been revealed before (`lastTypedVersionRef`).

When a streamed run is showing, the streamed text is already on screen; the typewriter path is what covers the non-streamed case, and re-revealing an already-revealed version writes the stored text directly.

## The Opt-in Flag Is Not Wired

`services/ai/index.js` exports:

```js
isStreamingEnabled()   // localStorage 'oc_streaming_enabled' === 'true'
setStreamingEnabled(enabled)
```

and `STORAGE_KEYS.STREAMING_ENABLED` (`oc_streaming_enabled`) exists in `src/config/constants.js`.

No code in `src/` reads `isStreamingEnabled()`, there is no Settings toggle, and there is no CLI command that calls `setStreamingEnabled()`. The functions and the key are currently dead code. Consequence: **agentic text steps always attempt to stream**, and there is no user-facing way to turn streaming off. Wiring the flag into the pipeline (and into Settings) is a pending change, not a feature that exists.