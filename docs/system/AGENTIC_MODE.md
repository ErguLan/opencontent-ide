# Agentic Mode

## Overview

Agentic Mode turns the AI from a **single-response generator** into a **multi-step task executor**. Instead of one prompt producing one response, the AI plans a sequence of steps and executes them autonomously.

The orchestration lives in `src/services/ai/agenticPipeline.js`. The UI layer only reads what this module publishes.

## Strategies

`executeAgenticPipeline` picks one of three strategies, in this order:

1. **Native tool-calling** — used when the active text model declares `capabilities.toolCalling`. The model requests tools through the provider tool interface. If the model answers with a JSON tool command instead, that JSON is parsed and executed as tools.
2. **Fallback tool commands** — the planner is asked for `{"actions": [...]}`. Every action is executed through the same tool runtime.
3. **JSON plan steps** — the planner returns an array of `{ type, description, prompt }` steps (`text`, `chat`, `image`, `analyze`).

All three share the same failure contract.

## Flow

```
User: "Create a post about coffee, then generate 3 images"
    ↓
executeAgenticPipeline({ prompt, t, onSteps, onChunk, signal, ... })
    ↓
Strategy resolution (native tools → fallback actions → plan steps)
    ↓
Plan strategy:  onSteps(steps, all "waiting") → per step "working" → terminal
Tool strategies: steps are created as they run: "working" → terminal
    ↓
executeAgentTool / sendToAI / generateImage / analyzeImage
    ↓
success  → "completed"
error    → "failed"  + entry appended to `failures`, loop continues
limit    → "skipped"  (never a failure)
no model → "skipped"  (never a failure)
abort    → throws Error('REQUEST_ABORTED')  (never a step status)
    ↓
Returns { plan, text, analysis, images, imageUrl, imagePrompt,
          pendingSaves, model, imageModel, failures, partial, retryable }
```

`waiting` only appears in the plan strategy, where the whole plan is published before execution starts. The tool strategies publish a step when the call starts, so those steps begin at `working`.

Also exported, for callers that need to branch without importing the whole pipeline:

| Export | Value |
|--------|-------|
| `AGENTIC_ABORT_CODE` | `'REQUEST_ABORTED'` |
| `AGENTIC_IMAGE_LIMIT_CODE` | `'IMAGE_TASK_LIMIT_REACHED'` |
| `AGENTIC_IMAGE_LIMIT_STATUS` | `'image-limit-reached'` (a tool result status, not a step status) |

## Step Status Contract (consumed by the UI)

The pipeline emits **exactly five** statuses. They are exported as constants so no consumer needs to hardcode the strings.

```js
import { AGENTIC_STEP_STATUS, AGENTIC_STEP_STATUSES } from '../../services/ai/agenticPipeline';
```

| Constant | Value | Semantics |
| --- | --- | --- |
| `AGENTIC_STEP_STATUS.WAITING` | `'waiting'` | Queued, not started yet. |
| `AGENTIC_STEP_STATUS.WORKING` | `'working'` | Currently running. Never a terminal state. |
| `AGENTIC_STEP_STATUS.COMPLETED` | `'completed'` | Finished and produced its intended output. |
| `AGENTIC_STEP_STATUS.FAILED` | `'failed'` | Could not finish. The run continued; the error is in `failures`. |
| `AGENTIC_STEP_STATUS.SKIPPED` | `'skipped'` | Intentionally not executed (image limit reached, no image model, nothing to analyze). Not an error. |

`AGENTIC_STEP_STATUSES` is the frozen array of the five values, in that order.

Rules the UI must follow:

- `'completed'` is the only success terminal state. There is no `'done'` and no `'error'` in this vocabulary.
- A step left in `'working'` at the end of a run always indicates a bug. Every code path ends in `completed`, `failed` or `skipped`.
- `'skipped'` is not an error. Do not show an error style or offer a retry for it.
- `'failed'` steps carry a translated, human-readable `text`. Show that text; do not invent your own message string.
- Cancellation is reported separately, through a thrown `Error('REQUEST_ABORTED')`. It is never a step status.

### Step identity

| Strategy | Step id |
| --- | --- |
| Native tool calling | `tool-turn`, then `tool-call-${call.id || index}` |
| Fallback actions | `fallback-tool-${index}` |
| JSON plan | `agentic-${index}` |
| Planner failure | `agentic-planner` |
| OpenRouter server-side image tool | `tool-call-openrouter:image_generation` |

`onSteps` receives either the full array (tool strategies) or an updater function (plan strategy). Both forms are supported and must be handled.

## Result Contract

```js
{
    plan,          // normalized step descriptors, unchanged
    text,          // final text; includes a translated notice when steps failed
    analysis,      // accumulated vision analysis
    images,        // artifacts produced
    imageUrl,      // primary visual or null
    imagePrompt,
    pendingSaves,  // artifacts awaiting user approval
    model,
    imageModel,
    failures,      // always an array, possibly empty
    partial,       // true when something failed but output was still produced
    retryable      // true when at least one failed step can be retried alone
}
```

### `failures`

Every entry:

```js
{ stepId, name, code, message, retryable }
```

- `stepId` matches the id published through `onSteps`, so the UI can point at the exact step.
- `name` is the tool name or the plan step type.
- `code` is a stable machine code such as `IMAGE_GENERATION_FAILED`, `IMAGE_ARTIFACT_NOT_FOUND`, `UNKNOWN_AGENT_TOOL`. Use it for branching, never for display.
- `message` is already translated. Display it as-is.
- `retryable` is `true` for image tool and image step failures, where re-running only that step makes sense.

Skipped steps never appear here. Neither does the image limit.

### `partial` and `retryable`

- `partial === true` means at least one step failed **and** the run still produced text, analysis or images. The result is usable but incomplete.
- `retryable === true` means at least one entry in `failures` has `retryable === true`. That is the signal for the UI to offer a retry. The retry itself re-runs the whole last request; it is not per-step.

## Failure Handling Rules

1. **No step failure aborts the run.** Every execution site is wrapped in `try/catch`: `executeAgentTool` in the native-tool loop, in the fallback-action loop, and every plan step in the plan loop. A failing step becomes a `failed` status plus a `failures` entry, and execution continues with the next step or call. Output already produced — images in particular — is preserved.
2. **Cancellation is the exception, not a failure.** An aborted signal raises `Error('REQUEST_ABORTED')`, which is re-thrown before any `failures` bookkeeping runs. It never becomes a `failed` step and never sets `partial`.
3. **The planner is the only hard stop.** Without a plan there is nothing to execute, so a failed planner call still throws `AGENTIC_PLANNER_FAILED`. A `failed` step is published first (`stepId: 'agentic-planner'`) so the UI is not left spinning.
4. **Reaching the image limit is not an error.** `IMAGE_TASK_LIMIT_REACHED` and the `image-limit-reached` result status both map to `skipped`, in the tool strategies and in the plan loop.
5. **A missing image model is not an error.** An `image` step without `selectedImageModel` is `skipped`. An `analyze` step with nothing to look at, or no vision model, is `skipped`.
6. **The text never pretends success.** When `failures` is non-empty the final text gets a translated notice (`agentic.partialFailureNotice`). When a run produces nothing usable, `cleanTextResults` returns a translated `agentic.noOutputNotice` rather than an empty string.
7. **Model refusals are filtered out.** `VISUAL_REFUSAL_PATTERN` drops refusal text when a visual was actually produced, so the user never sees "I cannot generate images" next to a real image.

### Why this changed

This is the most important behavior change in the pipeline. Previously a failed image step or tool call aborted the run, so an earlier text result was never shown and the reason was never reported: the failure disappeared silently. Today the run finishes, `failures` describes exactly what did not happen, `partial` marks the result as incomplete, and `PartialFailureNotice` renders the list with a retry action when `retryable` is true.

The rule applies uniformly to tools and to plan steps. A `text` or `chat` step that returns `success: false` throws inside `runTextStep`, and that throw is caught by the same loop-level `try/catch` that catches tool errors, so it becomes a `failed` step and the run continues. The only difference is what is lost: a failed text step removes that step's contribution from the accumulated context passed to later steps, while a failed tool step may have produced a partial result the runtime already returned. Neither distinction is a reason to abort the whole run.

## Interface Behavior

An agentic run result becomes a version carrying `agenticSteps`, `agenticFailures`, `agenticPartial` and `agenticRetryable`. Two components render from that:

- `AgentStepsLog.jsx` — the step list. `WorkspaceCanvas` renders it for the running request; `WorkspaceResultCard` renders it `compact` under a finished result.
- `PartialFailureNotice.jsx` — rendered by `WorkspaceResultCard` when `agenticFailures.length > 0`:
  - Header uses `settings.agentic.partialFailureNotice` with the failure count.
  - One row per failure: `failure.name || failure.stepId`, then the already-translated `failure.message`.
  - The retry button renders only when `retryable` is `true`; it is wired to `handleRetryGeneration`, which re-runs the last tracked request.
  - The container is `role="status"` with `aria-live="polite"`, so a partial result is announced rather than only drawn.

Note the two keys: the pipeline appends its own notice to the result text with `agentic.partialFailureNotice`, while the component's header uses `settings.agentic.partialFailureNotice`. Both are translated; they are not the same string.

## Usage Tracking

The pipeline itself does not touch usage counters. Its caller does, through `recordUsage(action)` in `useWorkspaceGeneration`, which wraps `incrementUsage` and refreshes the displayed totals:

| Run | Counters |
|-----|----------|
| Agentic run | `generate`, plus `image` when a visual was produced, plus `iteration` on an iteration |
| Direct text run | `generate`, plus `iteration` on an iteration |
| Direct image run | `image` |

Batch runs count through `useWorkspaceBatch`.

## Current Limitations

- Supported plan step types are `text`, `chat`, `image` and `analyze`. There is no explicit `edit` type; editing goes through the `edit_image` tool in the tool strategies.
- Retry is whole-run, not per-step. The pipeline reports `retryable` and the failing `stepId`; it does not re-execute anything by itself, and the retry the UI offers re-runs the last request.
- `partial` only reflects failures. Skipped steps (image limit, missing model) are reported through the step status but do not set `partial`.
- The plan is produced by the model. Unparseable JSON degrades to a single text step, and a plan that omits an image step gets one appended when the request looks visual.
- The native tool loop is capped at 4 turns.
- The image limit is derived from local save settings (`maxImagesPerTask`, capped to 12, or 1 when multiple images are disallowed) unless the caller passes an explicit `imageLimit`.