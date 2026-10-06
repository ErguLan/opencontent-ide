## Gallery & Media System

There are three surfaces over the same asset store, and they are not interchangeable:

| Surface | Route | What it shows |
|---------|-------|---------------|
| Media panel | `/workspace` | Assets in context during creation |
| Gallery | `/gallery` | Image-only grid |
| Library | `/library` | Media assets **and** artifacts, with kind and delivery-state filters |

Use `/library` as the default place to find and manage stored work. `/gallery` remains routed and in use for the image-only view.

## Media Service (`src/services/mediaService.js`)

Stores uploaded and generated images in **IndexedDB**, in the `user-assets` store of the unified database.

| Property | Value |
|----------|-------|
| Database | `OpenContentDB` (version 1) |
| Object store | `user-assets` |
| Key path | `id` (auto-generated as `asset_{timestamp}_{random}`) |
| Indexes | none |

Assets used to live in `OpenContentMediaDB`. That database is migrated automatically on first use, then deleted. See `docs/system/PROJECTS.md` for the migration rules: idempotent, non destructive until the copy commits, and newest-wins on an `id` collision.

`user-assets` holds base64 data URLs, so the whole record is the value. There is no index on purpose: there is exactly one asset shape, and queries are full-store reads filtered in memory.

### Asset Structure

```js
{
    id: "asset_1712345678901",
    name: "coffee-cup.png",
    type: "image/png",
    data: "data:image/png;base64,...",   // Base64 encoded
    role: "reference" | "template" | "logo" | "overlay",
    tags: ["agentic", "generated"],
    status: "draft",                      // Delivery state. See below.
    createdAt: "2026-07-27T...",
    schemaVersion: 1
}
```

`schemaVersion` is stamped on every stored record.

### Delivery State on Media

`status` is the asset's delivery state — `draft`, `in-review`, `approved`, `published` — not a job status. Older records carry values such as `completed`; `resolveDeliveryState` reads those as `draft` rather than failing to load.

- `saveMedia` stores `resolveDeliveryState(options.status)`, so a legacy caller value becomes a draft without changing that caller.
- `updateMediaMetadata` validates `updates.status` as a transition from the stored state. An illegal move rejects with a coded error and leaves the asset untouched, because the read and the write run inside one transaction and the error aborts it.
- The public API of `mediaService` is unchanged.

**The asymmetry with artifacts is real.** Artifacts record delivery transitions in their operation log, so a transition is undoable, versioned and replayable. Media assets have no operation log: they carry the current state and validate the same way, but their history is not recorded as operations. Advancing a media asset is therefore not undoable the way undoing an artifact operation is. See `docs/system/DELIVERY.md`.

### Functions

| Function | Description |
|----------|-------------|
| `saveMedia(file, name, options)` | Save a file. Returns the asset object. |
| `getAllMedia()` | All assets, sorted by creation date. |
| `getMedia(id)` | One asset by ID. |
| `deleteMedia(id)` | Delete by ID. |
| `updateMediaMetadata(id, updates)` | Partial update (`name`, `role`, `tags`, `status`). |
| `countMedia()` | Total assets. |
| `fileToBase64(file)` | Convert File/Blob to a base64 data URL. |

### Role System

Each asset has a `role` that determines how it's used in generation:

| Role | Purpose |
|------|---------|
| `reference` | Visual reference for the AI |
| `template` | Base template to edit/modify |
| `logo` | Brand logo for overlay |
| `overlay` | Image to overlay on generated content |

### Auto-Save During Generation

A generated image is saved to the media library automatically, in both direct and agentic mode, through `saveImageArtifact` in `src/services/imageArtifacts.js`, with `kind: 'generated'` and the generating model recorded. The workspace then receives the asset id and can reference it.

Note the delivery consequence: nothing in the generation path assigns a delivery state, so `saveImageArtifact` uses its own default, `statusForNewItem()` (`draft`). Every generated image is born a draft and is advanced from the Library.

## Generated images are also artifacts

Every image that OpenContent generates is registered as an artifact of type `image` at the moment it is stored, because `saveImageArtifact` is the single funnel all generation paths go through (workspace, agentic pipeline, agent tools, browser CLI). Nothing had to be rewired to get there.

| | Where it lives | What it holds |
|---|---|---|
| Media asset (`user-assets`) | `mediaService.js` | The base64 bytes, the file name, the role. |
| Image artifact (`artifacts`) | `artifacts/imageArtifact.js` | `mediaAssetId`, `prompt`, `parameters`, `model`, the operation log, versions and delivery state. |

**The bytes are not duplicated.** The artifact holds a reference, and the only way to read the image is `readImageArtifactAsset()`. Regeneration stores the new image as a new asset chained with `parentAssetId` and records the change on the artifact, so undo shows the previous image instead of a promise.

See `docs/system/ARTIFACTS.md` for the operation contract and `docs/system/DELIVERY.md` for how a generated image is advanced.

### Regeneration

`regenerateImageArtifact(artifact, { prompt, parameters, model, generate })` is the only regeneration path. The image generator is **injected by the caller**: the service stores and records, and it never chooses an image model on the user's behalf.

1. It reads the current configuration from the artifact.
2. It calls the injected generator. A provider failure rejects with `IMAGE_GENERATION_FAILED` and leaves the artifact untouched.
3. It stores the returned bytes as a new media asset.
4. It applies `set_image_config` to the artifact, so the change is undoable, redoable and versionable.
5. Artifact Studio snapshots the result and persists it, exactly like every other artifact edit.

### Images that existed before image artifacts

Generated images stored before this model were only media. `ensureGeneratedImagesHaveArtifacts()` gives each one an artifact:

- Only generated images (`kind` `generated`/`edited`, or `source` `generated`/`agentic`, with an image mime type). Uploads are never adopted.
- The asset is referenced, not copied, and its `prompt`, `parameters` and `model` are recorded.
- The delivery state the asset already had is carried over, so nothing is reset to `draft`.
- Nothing is deleted or rewritten, the pass is idempotent, and it is memoized per page load. A run that cannot read the stores is not memoized, so the next caller retries.
- If registering the artifact fails right after an image is generated, the run still succeeds: the image is already stored, the failure is logged, and the next backfill adopts it.

The Library and Artifact Studio both call it and reuse the snapshot it returns, so nothing is queried twice.

### One image, one card

A generated image is stored twice by design, so a naive list would show it twice. The Library resolves that with one rule:

> **A generated image is shown as its artifact. The media asset it references is not a second card.**

`src/features/library/libraryItems.js` implements it: an asset referenced by an image artifact is dropped from the media entries, and the artifact entry resolves its preview from the asset already loaded (a reference for display, not a copy). Consequences:

- Counts describe what is displayed, so the numbers match the grid.
- Opening an image card opens the artifact in Artifact Studio, where it can be regenerated, versioned and advanced through delivery.
- Uploaded assets are unaffected: a logo, a template or a reference is still a media card with its own detail view.
- A generated image that has no artifact yet (a failed registration, or a store that could not be read) stays visible as media instead of disappearing.

`/gallery` is deliberately left as the asset-level surface: it answers "which image files do I have", while the Library answers "what content did I create". Duplicating the rule there would hide files the user may want to attach or export.

## Library Page (`src/features/library/`)

Route: `/library`. The unified surface: media assets and artifacts in one list.

- Kind filters over media and artifacts, including `image`, which matches an image artifact and a generated image that has no artifact yet.
- Delivery-state filter (`all`, `draft`, `in-review`, `approved`, `published`, plus a derived `pending-review`) that works across both kinds at once. Media reads `status`, artifacts read `delivery.state`.
- A state badge on every card.
- A "needs review" count; for artifacts it also uses `describePendingReview`, which is true when work was applied after the last delivery transition.
- One card per piece of content (see "One image, one card" above). An image artifact opens in Artifact Studio; a media asset opens the asset detail view.
- Media assets are advanced from the asset detail view. A published asset shows the terminal explanation instead of buttons.
- A rejected transition shows the error `code` alongside the translated message.
- State-specific empty states that explain what the state means before saying there is nothing in it.

## Gallery Page (`src/features/gallery/`)

Route: `/gallery`. Image-only.

- **Grid view** — responsive grid of image thumbnails
- **Preview overlay** — full-size image with metadata
- **Download** — saves the image file
- **Delete** — removes the asset, with a short undo window

### States

- **Loading** — while querying IndexedDB
- **Error** — with a retry action
- **Empty** — points at the library
- **Populated** — grid with hover overlay (name and actions)
- **Preview** — full-screen overlay with image details

## AI Gallery Access

The agent reaches assets through controlled tools, never through raw browser storage:

- `list_gallery_assets` — asset metadata and IDs.
- `get_gallery_asset` — reads one selected asset.
- `clone_gallery_asset` — copies an asset to an approved destination and leaves the original in place.

Cloning is non-destructive by construction. The source is never moved or deleted, and external writes still follow the local save settings and the approval requirement.

The standalone CLI and the MCP process cannot reach the browser's IndexedDB. They use the explicitly configured `OC_GALLERY_DIR` and may only write to `OC_OUTPUT_DIR` or directories listed in `OC_ALLOWED_CLONE_DIRS`, with `OC_ALLOW_LOCAL_WRITES=true` required first.

## MediaPanel (`src/features/workspace/components/MediaPanel.jsx`)

Sidebar panel for managing assets during creation.

- **Upload** — drag-and-drop or click
- **Filter** — search by name, filter by role
- **Role assignment** — `reference` / `template` / `logo` / `overlay`
- **Toggle active** — choose which assets are sent to the model
- **Attach to chat** — attach an asset to the current prompt
- **Delete** — remove an asset
- **Limits** — max file size 10 MB; 3 assets for Free, 10 for Pro. Reaching the limit reports the file size and opens the paywall with reason `MEDIA_LIMIT`.

### Data Flow

```
User uploads image
    ↓
handleUploadMedia(file)
    ↓
validateFile(file)              rejects non-images and files over 10 MB
    ↓
countMedia() >= plan limit ?    → onAssetLimitReached({ reason: 'MEDIA_LIMIT' })
    ↓
saveMedia(file, name, { role })  → OpenContentDB / user-assets
    ↓
setMediaAssets(prev => [...prev, newAsset])
    ↓
Renders in the MediaPanel grid
```
