# Gallery & Media System

## Media Service (`src/services/mediaService.js`)

Stores uploaded and generated images in **IndexedDB** (`OpenContentMediaDB`, store `user-assets`).

### Asset Structure

```js
{
    id: "asset_1712345678901",
    name: "coffee-cup.png",
    type: "image/png",
    data: "data:image/png;base64,...",   // Base64 encoded
    role: "reference" | "template" | "logo" | "overlay",
    tags: ["agentic", "generated"],
    createdAt: "2026-07-27T..."
}
```

### Functions

| Function | Description |
|----------|-------------|
| `saveMedia(file, name, options)` | Save file to IndexedDB. Returns asset object. |
| `getAllMedia()` | Get all assets, sorted by creation date. |
| `deleteMedia(id)` | Delete asset by ID. |
| `updateMediaMetadata(id, updates)` | Partial update (name, role, tags). |
| `countMedia()` | Count total assets. |
| `fileToBase64(file)` | Convert File/Blob to base64 data URL. |

### Role System

Each asset has a `role` that determines how it's used in generation:

| Role | Purpose |
|------|---------|
| `reference` | Visual reference for the AI |
| `template` | Base template to edit/modify |
| `logo` | Brand logo for overlay |
| `overlay` | Image to overlay on generated content |

### Auto-Save During Generation

When the AI generates an image (normal or agentic mode), it's automatically saved to the media library:

```js
const blob = await (await fetch(imageUrl)).blob();
await saveMedia(blob, `generated-${Date.now()}.png`, {
    role: 'reference',
    tags: ['generated']
});
```

## Gallery Page (`src/features/gallery/`)

Route: `/gallery`

### UI Components

- **Grid view** — Responsive grid of image thumbnails
- **Preview overlay** — Full-size image with metadata (name, date)
- **Download** — Downloads the image file
- **Delete** — Removes from IndexedDB

## AI Gallery Access

The agent can use controlled gallery tools without exposing arbitrary browser storage:

- `list_gallery_assets` — Lists image metadata and IDs from IndexedDB.
- `get_gallery_asset` — Reads one selected gallery asset.
- `clone_gallery_asset` — Copies an asset to an approved destination while retaining the original in the gallery.

Cloning is deliberately non-destructive. The source asset is never moved or deleted. External writes still follow the local save settings and approval requirement.

The standalone CLI and MCP process cannot access browser IndexedDB directly. They use the explicitly configured `OC_GALLERY_DIR` filesystem directory and only clone to `OC_OUTPUT_DIR` or directories listed in `OC_ALLOWED_CLONE_DIRS`.

### States

- **Loading**: Shows spinner while querying IndexedDB
- **Empty**: Shows "No images yet" message
- **Populated**: Grid with hover overlay (name + actions)
- **Preview**: Full-screen overlay with image details

## MediaPanel (`src/features/workspace/components/MediaPanel.jsx`)

Sidebar panel in the workspace for managing assets during content creation.

### Features

- **Upload** — Drag-and-drop or click to upload images
- **Filter** — Search by name or filter by role
- **Role assignment** — Change asset role (reference/template/logo/overlay)
- **Toggle active** — Select which assets are sent to the AI
- **Attach to chat** — Quick-attach assets to the current prompt
- **Delete** — Remove assets
- **Limit**: Free users: 3 assets, Pro users: 10

### Data Flow

```
User uploads image
    ↓
handleUploadMedia(file)
    ↓
validateFile(file) ← checks type (image/) and size (max 10MB)
    ↓
countMedia() ← checks limit
    ↓
saveMedia(file, name, { role }) → IndexedDB
    ↓
setMediaAssets(prev => [...prev, newAsset])
    ↓
Renders in MediaPanel grid
```
