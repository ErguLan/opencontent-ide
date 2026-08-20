# Project Persistence (`src/services/projectsLocal.js`)

## Storage

Uses **IndexedDB** with database name `OpenContentProjectsDB` (version 1), object store `projects`.

**Key path:** `id` (auto-generated if not provided)

## Functions

### `getLocalProjects()`
Returns all projects sorted by `updatedAt` descending. Deduplicates by `id` (keeps newest version).

### `saveLocalProject(project)`
Create or update a project.

**Create** (no `id`):
```js
const project = await saveLocalProject({
    name: "My Project",
    prompt: "Generate a post...",
    type: "content"
});
// project.id will be generated as: local_1234567890_abc123
```

**Update** (with `id`):
```js
await saveLocalProject({
    id: "local_1234567890_abc123",
    result: "Generated text...",
    versions: [...],
    currentVersionIndex: 0,
    history: [...]
});
```

The function:
1. Opens IndexedDB
2. If no `id`, generates: `local_{Date.now()}_{random8chars}`
3. Checks if a project with the same ID already exists
4. Merges with existing data (preserves `createdAt`)
5. Sets `updatedAt` to current ISO timestamp
6. Requires `project.id` to be provided for updates

### `deleteLocalProject(projectId)`
Deletes by ID. Returns `true` on success.

## Data Flow: Project Creation During Generation

```
User submits prompt on Landing page
    ↓
Navigate to /workspace with state: { initialPrompt: "..." }
    ↓
useEffect: detect initialPrompt
    ↓
startGeneration("...")
    ↓
if (!isIteration):
    saveLocalProject({ name, prompt, type, createdAt })  ← creates project
    setCurrentProjectId(localProj.id)                      ← sets current
    loadProjects()                                         ← refreshes sidebar
    ↓
Generate with AI...
    ↓
saveLocalProject({ id, result, versions, history })       ← updates project
    ↓
URL sync effect navigates to /project/:id
    ↓
Sidebar shows the new project
```

## Migration

On first load, `migrateLegacyLocalStorageIfNeeded()` checks if the IndexedDB store is empty and imports any projects from the legacy `localStorage` key `oc_local_projects`.
