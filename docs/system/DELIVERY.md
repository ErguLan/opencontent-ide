# Delivery State

Generating content is not the same as delivering it. A real content studio asks for a piece, refines it, reviews it, approves it and publishes it, and it can prove what happened. Before this model existed, an artifact or an image was a blob: it appeared, it was edited, and there was no way to tell a rough draft from something already shipped.

Delivery state is that missing concept. It is shared by artifacts (`artifacts` store) and media assets (`user-assets` store) so that both sides of the library speak the same language.

The implementation lives in `src/services/delivery/deliveryState.js`. It is a pure module: no React, no IndexedDB, no i18n, no clock of its own. Anything that needs the model reads it from there.

## The model

Four states, in order:

| State | Meaning |
|-------|---------|
| `draft` | Work in progress. It can still be edited freely. Every new item is born here. |
| `in-review` | Waiting for a human. It is no longer auto-edited without an explicit action. |
| `approved` | Reviewed and accepted, ready to be published. |
| `published` | Delivered. This is the final state. |

Valid transitions, and only these:

```
draft -> in-review -> approved -> published
```

Rules that the code enforces rather than documents:

- **Forward only.** No transition goes backwards and none skips a step. `draft -> published` is rejected even if it is the obvious intention.
- **`published` is terminal.** There is no way out of it, and no bypass into it.
- **Every move is validated against the current state.** If the current state is not what the caller assumed, the call fails with a coded error instead of silently doing nothing.
- **A new item starts in `draft`.** There is no "no state" and no implicit state.

### Why `published` is terminal

Un-publishing is not a small feature, it is a different product decision each time. A published piece may already be exported, copied, printed, cited or synced somewhere this application cannot see. Letting a piece silently fall back to `approved` would make the library lie: it would claim something is not published while the world already treats it as published.

So the terminal decision is honest by construction:

- The published piece stays published. That is the record of what was delivered.
- To change it, create a new version. `snapshotArtifact` already exists for that, and a new version is a new piece in the library with its own lifecycle. The published one remains as the record of the release.
- A published piece can still be read, exported, duplicated and versioned. What it cannot do is travel backwards.

The cost is honest too: there is no "unpublish" button. If a real need for it appears (a legal takedown, a wrong release), that is a fifth decision with its own audit trail, not a flag to flip on an existing one. It is deliberately not implemented here.

## Contract

`src/services/delivery/deliveryState.js` exports:

| Export | Purpose |
|--------|---------|
| `DELIVERY_STATES` | Frozen map of the four state identifiers. |
| `DELIVERY_TRANSITIONS` | Frozen adjacency list: `state -> allowed next states`. |
| `DELIVERY_OPERATION_TYPE` | `'set_delivery_state'`, the operation type used by artifacts. |
| `DELIVERY_ERROR_CODES` | The three error codes thrown by validation. |
| `DeliveryTransitionError` | Error class carrying `code`, `from` and `to`. |
| `isDeliveryState(state)` | Whether a value is one of the four identifiers. |
| `isValidTransition(from, to)` | Boolean check, no side effects. |
| `nextStates(from)` | Allowed next states; empty for terminal or unknown states. |
| `validateTransition(from, to)` | Returns `to` when legal, throws otherwise. |
| `isTerminal(state)` | True only for `published`. |
| `statusForNewItem()` | `draft`. |
| `resolveDeliveryState(value)` | Tolerant reader: unknown or legacy values read as `draft`. |
| `createDelivery(at)` | Initial delivery record `{ state, history: [{ state, at }] }`. |
| `normalizeDelivery(value, { at })` | Repairs a partial or legacy record without inventing transitions. |
| `baseDelivery(value, { at })` | The record a replay starts from: the first history entry. |
| `withDeliveryState(delivery, to, { at, note })` | Validated, append-only state change. Never mutates its input. |
| `describePendingReview(artifact)` | Derivation: boolean, see below. |

### Error codes

| Code | Raised when |
|------|-------------|
| `DELIVERY_UNKNOWN_STATE` | `from` or `to` is not one of the four identifiers. |
| `DELIVERY_TERMINAL_STATE` | The current state is `published` and something tried to move it. |
| `DELIVERY_INVALID_TRANSITION` | The move is real but out of order or backwards. |

They are separate codes on purpose. "You cannot un-publish this" and "review comes before approval" are different mistakes, and the interface reports the code it receives.

### The states are not translated here

`deliveryState.js` has no i18n knowledge and must not acquire any. The identifiers are stable machine values written to storage; translating them inside the service would make the stored data depend on the interface language. All user-facing labels live in `src/i18n/en.json` and `src/i18n/es.json` under `delivery.states.*`, resolved by the components that render the state.

### Pending review is a derivation, not a state

A piece already sent to review can still be edited, and those edits are exactly what nobody has looked at. Rather than adding a fifth state, `describePendingReview(artifact)` derives it from the operation log: a piece is pending review when it is not a draft and work was applied after the last delivery transition. Drafts are never pending, because nothing has been submitted yet.

The interface surfaces this as a marker. The underlying state is unchanged, and a piece in `approved` with fresh edits is still `approved`.

## Artifacts: delivery goes through the operation log

An artifact carries:

```js
delivery: {
  state: 'draft',
  history: [{ state: 'draft', at: '2026-01-01T10:00:00.000Z' }]
}
```

The state changes through the artifact operation types, never through a side door:

```js
applyArtifactOperation(artifact, { type: OPERATION_TYPES.SET_DELIVERY_STATE, state: 'in-review' })
```

This is the important part. Because the change is an ordinary operation:

- It lands in `artifact.operations` with an id and a timestamp, exactly like an edit.
- `undoArtifact` and `redoArtifact` move it, like any other operation. Replaying the log rewinds delivery to `baseDelivery` first, so a transition is never validated against a state it already passed through.
- `snapshotArtifact` captures it into `versions`, and each version records the delivery state it was taken at.
- Anything that audits an artifact (operation history, versions, CLI, MCP) sees the lifecycle without a new mechanism.

`validateOperation` rejects a `set_delivery_state` whose `state` is not one of the four identifiers, so an operation log can never contain a state that the machine would not accept.

### The AI cannot move a piece

`aiArtifactOps.js` validates planned changes against its own action allowlist, and that allowlist has no delivery action. There is no path from a model response to a delivery transition, so a piece cannot be approved or published by AI. Delivery is a human decision, and the state machine is the only way to record it.

### Legacy artifacts

Artifacts persisted before this model have no `delivery` record. `createArtifact` normalizes them to `draft` with a single history entry dated from the artifact's `createdAt`, and `getArtifact` / `listArtifacts` apply the same normalization on read. No rewrite migration is needed and no load breaks.

## Media: the asset `status` field

The `user-assets` record already had a `status` field that meant nothing durable. It now means the delivery state.

- `saveMedia` stores `resolveDeliveryState(options.status)`. A legacy value such as `completed` still reads as `draft` instead of failing to load, so a caller that has not been updated keeps working.
- `updateMediaMetadata` validates `updates.status` as a transition from the stored state. An illegal move rejects with a coded error and leaves the asset untouched, because the update runs inside the same transaction and the error aborts it.
- The public API of `mediaService` is unchanged.

`saveImageArtifact` defaults its `status` argument to `statusForNewItem()`, so a generated image is born a `draft` for the real reason rather than by relying on normalization.

Media assets have no operation log, so their delivery state is not replayable the way an artifact's is. They follow the same state machine and the same validation, but their history is not recorded as operations, and advancing a media asset is not undoable the way undoing an artifact operation is. This asymmetry is real and is not hidden.

### Generated images are artifacts, not media cards

An image generated by OpenContent is an artifact of type `image` that references its media asset. Its delivery state therefore lives in the artifact and moves through the operation log like any other artifact: undoable, redoable and captured in versions. See `docs/system/ARTIFACTS.md`.

The asset keeps its own `status` because it is also a file the user can attach, reference or export. That is a real asymmetry with one rule to follow: **advance the state on the artifact**. The asset `status` of a generated image is the state at the moment it was stored, kept for the attachment surface; it is not the delivery record.

Adopting older images keeps the state they already had, so nothing is silently reset to `draft`.

### What is still missing for media

- Uploaded assets (logos, templates, references, overlays) have no operation log, so their delivery history is not recorded: the `status` field holds the current state only, and advancing one is not undoable.
- `describePendingReview` is only derivable for artifacts. For an uploaded asset the Library treats `in-review` as needing attention by state alone.
- A regeneration is not a media operation. Each regeneration creates a new asset (chained with `parentAssetId`) and a new operation on the artifact; the previous asset stays until someone deletes it. There is no pruning yet.

## Interface

- **Artifact Studio** (`/artifacts`): the delivery panel shows the current state, only the valid next transitions, the state history and the pending-review marker. A published piece shows the terminal explanation instead of buttons, including why it cannot go back and that the way forward is a new version. Advancing the state calls `snapshotArtifact` immediately, so every transition also becomes a labeled version, and the artifact's Undo button reverts it like any other edit. A rejected transition renders the error `code` next to the translated message.
- **Library** (`/library`): a delivery-state filter that works over media and artifacts at once, a state badge on every card, a "needs review" count, and a state-specific empty state that explains what the state means before saying there is nothing in it. Media assets are advanced from the asset detail view, with the same terminal treatment when they reach `published`. An image artifact is advanced from Artifact Studio, because the image artifact is the piece, not the file.
- **Workspace** (`/workspace`): the Publish action resolves the piece of the current project and asks this machine for permission to publish it.
- **State labels** live under `delivery.states.*` in the translation tree. The service never returns user-facing copy.

### Publishing from the workspace

The workspace used to write the current version into a list held in `localStorage` under `oc_publication_queue`. That list was removed: nothing read it, it validated nothing, it was not part of any artifact and it did not survive the lifecycle of the project it claimed to publish. Publishing is now one thing, not two.

`handlePublishProject` in `useWorkspaceActions`:

1. Resolves the piece: the most recently updated artifact of the current project. With no artifact it says so and points at Artifact Studio, because delivery is managed on artifacts. It never creates one to have something to publish.
2. Reads the state with `resolveDeliveryState` and asks `nextStates` what may come next. Only `approved` may move to `published`, so the action is enabled from any state and explains the block instead of hiding it.
3. On `published` it does nothing and explains why: the state is terminal and the way forward is a new version.
4. Otherwise it applies `set_delivery_state` through `applyArtifactOperation`, snapshots with `snapshotArtifact` and persists with `saveArtifact`. It is an ordinary artifact edit, so it is versioned, undoable and auditable.

Every one of those outcomes has a code path and a translated message under `workspace.publish.*`; there is no silent branch and no exception that leaves the interface guessing.

## Relationship with `docs/system/ARTIFACTS.md`

`ARTIFACTS.md` describes how artifacts are stored and edited. Delivery state is one operation inside that model, not a parallel system. Read them together: the operation log and version history are what make a delivery state auditable.
