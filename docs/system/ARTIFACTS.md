# Artifact Studio

OpenContent now treats text, images, diagrams, editable documents and PDFs as artifacts. Artifact data is local-first and stored in the `artifacts` store of the unified `OpenContentDB`.

## Storage

| Property | Value |
|----------|-------|
| Database | `OpenContentDB` (version 1) |
| Object store | `artifacts` |
| Key path | `id` (auto-generated as `artifact_{timestamp}_{random}` when absent) |
| Indexes | `type`, `projectId`, `updatedAt` (all non-unique) |

The access layer lives in `src/services/db/`. See `docs/system/PROJECTS.md` for the unified storage and migration rules; the same database and the same migration apply to artifacts, and the legacy `OpenContentArtifactsDB` is migrated automatically.

## Persistence

One record per artifact, stored as a whole in the `artifacts` store.

| Field | Purpose |
|-------|---------|
| `id` | Key. `artifact_{timestamp}_{random}` when absent. |
| `type` | One of `text`, `image`, `diagram`, `document`, `pdf`. |
| `name`, `projectId`, `source` | Identity and grouping. |
| `content` | Type-specific payload: nodes/connectors, pages/blocks, PDF original, or the image reference below. |
| `metadata` | Free-form artifact metadata, including `historyBase` used by undo. |
| `versions[]` | `snapshotArtifact` versions: `label`, `content`, `metadata`, `delivery`, `createdAt`. |
| `operations[]` / `operationCursor` | The operation log and how much of it is applied. Undo and redo rebuild the record by replaying it. |
| `delivery` | Delivery state and its history. See `docs/system/DELIVERY.md`. |
| `createdAt` / `updatedAt` | ISO timestamps. |

`delivery` is written by the same operation log as everything else, through the `set_delivery_state` operation. It is not a separate write path, so a delivery transition is undoable and is versioned like an edit. Artifacts stored before delivery state existed have no `delivery` field: `createArtifact`, `getArtifact` and `listArtifacts` normalize them to `draft` on read, so no rewrite migration is required and no record fails to load.

## Delivery state

An artifact is born in `draft` and moves forward only: `draft -> in-review -> approved -> published`. `published` is terminal. The state is a field, not a new store, and the full model, its error codes and the pending-review derivation live in `docs/system/DELIVERY.md`.

## Image artifacts

An image generated inside OpenContent is an artifact of type `image`, with the same operation log, undo/redo, versions and delivery state as a diagram or a document. The bytes are not in the artifact.

| `content` field | Meaning |
|-----------------|---------|
| `mediaAssetId` | The `user-assets` record that holds the bytes. A reference, never a copy. |
| `prompt` | The prompt that produced the referenced image. |
| `parameters` | The generation parameters used (`size`, `quality`, `seed`, ...). Free-form object, passed through as given. |
| `model` | The image model that produced it. |

The generation configuration lives in `content`, not in the top-level `prompt`/`model` fields, because undo and redo replay `content`. Keeping one copy of the truth is what makes the history worth anything.

`src/services/artifacts/imageArtifact.js` owns that shape; `src/services/imageArtifacts.js` owns the storage side.

### Why the binary is not duplicated

An image can be large and every regeneration produces new bytes. An artifact that embedded its own copy would double the storage of every image and would still have to answer "which asset is the truth?" for deletion, export and quota. So:

- `saveImageArtifact()` stores the bytes once in `user-assets` and creates the artifact that references the asset.
- `regenerateImageArtifact()` stores the **new** bytes as a new asset chained with `parentAssetId`, and records the change on the artifact.
- The previous asset is never deleted, so undo shows the previous image instead of a promise. Deleting a version is an explicit operation, not a side effect of regenerating.

`readImageArtifactAsset(artifact)` is the only way the interface reads the bytes. An artifact whose asset is gone rejects with `IMAGE_ASSET_NOT_FOUND` and the Studio shows that state, rather than rendering an empty artifact.

### Operations

Exactly three operations apply to an image artifact, and only three:

| Operation | What it does |
|-----------|--------------|
| `set_image_config` | The result of a regeneration: new `mediaAssetId`, `prompt`, `parameters`, `model`. Undoable and versioned like any edit. |
| `set_metadata` | Rename, annotate. Reused from the shared allowlist. |
| `set_delivery_state` | The delivery lifecycle. Reused from `docs/system/DELIVERY.md`. |

`set_image_config` requires a `mediaAssetId`. A configuration without the asset it produced would make the artifact describe an image it does not hold, so it is rejected by `validateOperation`. The operation is also rejected on any other artifact type (`Operation set_image_config is not allowed on a diagram artifact`).

There is no operation to swap the image for an arbitrary stored asset. That would make the history a record of changes that were never generated.

### Artifacts that existed before this model

Generated images stored before image artifacts existed were only media. `ensureGeneratedImagesHaveArtifacts()` adopts every generated asset that has no artifact: it creates one artifact per asset, references the asset, copies the recorded prompt, parameters and model, and keeps the delivery state the asset already had. Nothing is deleted or rewritten, uploads are never adopted, the run is idempotent, and it returns the snapshot it read so a view can reuse it instead of querying the stores twice.

## Diagram support

`src/services/artifacts/diagramEngine.js`: structured nodes and connectors on a fixed-size canvas.

- `createDiagramArtifact()` — a 1200x800 canvas with grid 20 and snap on.
- Node shapes: `rect`, `rounded`, `ellipse`, `diamond`.
- `parseDiagramDsl(text)` — one node per bare line, one connector per `A -> B` (or `A => B`), then auto-layout.
- `autoLayoutDiagram()` — a fixed 3-column grid with configurable gaps. Not a force-directed solver.
- `diagramToSvg()` — standalone SVG with an arrow marker and escaped labels.
- Drag editing in Artifact Studio moves the selected node and snaps its position to a 10 px grid.

Connector operations (`addDiagramConnector`, `removeDiagramConnector`) mutate `content.connectors` directly rather than going through the operation log, so they are not undoable and are not versioned. Node add/update/remove and page operations do go through `applyArtifactOperation` and are undoable. Removing a node also removes the connectors attached to it.

## Documents and PDF

`src/services/artifacts/pdfEngine.js`.

- Documents are pages of blocks (`createDocumentPage`, `createTextBlock`, `createDiagramBlock`) with add/remove/reorder/update operations.
- `serializeDocumentToPdf()` produces a PDF Blob from scratch — catalog, page tree, one Helvetica font resource, a content stream per page, and a correct xref table. No PDF library is involved.
- `documentFromText()` splits on blank lines and paginates on an 82-character line estimate.
- Imported PDFs are stored as an immutable original: `createPdfArtifact({ sourceDataUrl })` sets `metadata.immutableOriginal: true` and keeps `content.originalDataUrl`. Edits are annotations in a separate layer (`addPdfAnnotation`, `removePdfAnnotation`), so the original bytes are never rewritten.

The boundary is deliberate: arbitrary third-party PDF content streams are not rewritten destructively without a parser that can preserve fonts and layout safely. Page-stream rewriting, font reconstruction and OCR stay behind the `PDF_PROCESSOR` extension point.

## Interfaces

- UI: `/artifacts`, `/artifacts/:artifactId`. Image artifacts appear in the list and the type filter, and are editable there; they cannot be created from the Studio, because one requires an image model and a provider call.
- Browser CLI: `artifact`, `diagram`, `document` (via the built-in artifact plugin)
- Standalone CLI: `node cli/artifacts.js`, `pdf create <text> -o file.pdf`
- REST: `/api/artifacts/*`
- MCP: `node mcp/artifacts.js`
- Plugins: artifact import/export/render/operation hooks, diagram symbol providers, PDF processors

## AI Safety Model

`src/services/artifacts/aiArtifactOps.js` runs entirely in the browser. No backend, no native build step.

```js
SAFE_ACTIONS = [
    'add_node', 'update_node', 'connect_nodes', 'layout_diagram', 'add_annotation',
    'set_document_text', 'add_page', 'remove_page', 'reorder_pages', 'set_metadata'
]
```

- Anything outside the allowlist is rejected before it can reach an engine.
- Every allowed action has a per-action argument validation table, because the engines assume the operation shape is already valid. An unvalidated `remove_page` without an id would drop every page.
- Every action that belongs to one artifact type is validated against the type in hand (`validateAiArtifactOperations(operations, { type })`). A `set_document_text` aimed at an image artifact is refused: applied blindly it would replace the content and discard the media asset reference.
- A batch is capped at 100 operations.
- `planArtifactOperations()` sends the artifact as data with an explicit instruction that its contents are never instructions, requires a registered text model, and is told only the actions that apply to that artifact type.
- Validated operations are `structuredClone`d before they are applied, so a caller's objects are not aliased into the artifact.

**There is no delivery action in the allowlist.** No path exists from a model response to a delivery transition, so a piece cannot be approved or published by AI. See `docs/system/DELIVERY.md`.

### The AI cannot regenerate an image

`set_image_config` is deliberately absent from the allowlist. The reasons are not squeamishness, they are the operation's own contract:

1. **A configuration change is inseparable from new bytes.** The operation requires the `mediaAssetId` of the image it describes. A model cannot produce one, because producing it means generating the image.
2. **It spends money and touches an external service.** The artifact planner is a plan-and-preview surface that edits the artifact in front of the user. Generating an image is a provider call with a cost, and that path already exists as a first-class agent tool (`generate_image`, `edit_image` in `toolRuntime`), where it runs with the user's own selected model and is reported as a step in the agentic plan.
3. **It would produce an unauditable change.** A model that could write an asset id would be able to point the artifact at any image in the store, making the history a record of something that never happened.

What the planner *can* do with an image artifact is `set_metadata`: rename it, annotate it. For an image the prompt shown in the Studio is editable too, but only as the configuration of the **next** generation: it takes effect when the user presses Regenerate, which is what creates the new bytes and records the operation.

## AI Flow in the Studio

For diagrams and PDFs, `runAi` calls `planArtifactOperations` and stores the result as `pending`; nothing is written until the preview is accepted. For documents, `runAi` sends the prompt to the active text model and rebuilds the document content directly through `documentFromText` — there is no preview step on that path. For images, the AI panel plans `set_metadata` only; regenerating is a button that spends a provider call and is recorded as `set_image_config`.

Either way the result is committed through `snapshotArtifact`, so it becomes a version and is undoable.
