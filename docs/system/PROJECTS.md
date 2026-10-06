# Project Persistence (`src/services/projectsLocal.js`)

## Storage

Uses **IndexedDB** through the unified database layer in `src/services/db/`.

| Property | Value |
|----------|-------|
| Database | `OpenContentDB` (version 1) |
| Object store | `projects` |
| Key path | `id` (auto-generated if not provided) |

Projects used to live in `OpenContentProjectsDB`. That database is now migrated automatically (see Migration below), and the three per-domain databases were replaced by this single one.

## Layering

| Module | Responsibility |
|--------|----------------|
| `src/services/db/schema.js` | Database name, version, stores and indexes |
| `src/services/db/connection.js` | One cached connection, `onversionchange` / `onblocked` handling |
| `src/services/db/access.js` | `get`, `put`, `add`, `putMany`, `deleteRecord`, `getAll`, `getAllByIndex`, `count`, `clear`, `withTransaction` |
| `src/services/db/records.js` | Pure helpers: timestamp parsing, sorting, dedupe, collision resolution, merge planning |
| `src/services/db/migration.js` | Legacy database and legacy localStorage migration |

The service layer contains no IndexedDB ceremony: it calls `ensureDatabaseReady()` and then uses the access helpers.

### Cross-domain transactions

`withTransaction(storeNames, mode, work)` runs `work` inside a single transaction spanning the named stores. `work` receives a `{ [storeName]: IDBObjectStore }` map and its return value becomes the result of the call, resolved only after the transaction commits. Throwing inside `work` aborts and rolls back.

Today it is used for single-store atomic read-modify-writes: `saveLocalProject` here and `updateMediaMetadata` in `mediaService.js` both open one transaction so the read and the write cannot interleave.

No caller yet spans several stores. That is the operation the primitive exists for — deleting a project together with its artifacts and its media in one atomic step, so a crash can never leave orphans behind. It is the reason all three domains share one database instead of three. Until someone uses it that way, removing a project does not remove its artifacts or media.

## Functions

### `getLocalProjects()`
Returns all projects sorted by `updatedAt` descending. Passes the result through `dedupeById` (keeps the newest copy of each `id`).

### `saveLocalProject(project)`
Create or update a project.

**Create** (no `id`):
```js
const project = await saveLocalProject({
    name: "My Project",
    prompt: "Generate a post...",
    type: "content"
});
// project.id is generated as local_{Date.now()}_{base36 random}
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
1. Ensures the database is open and migrated
2. If no `id`, generates: `local_{Date.now()}_{random8chars}`
3. Checks if a project with the same ID already exists
4. Merges with existing data (preserves `createdAt`)
5. Sets `updatedAt` to current ISO timestamp
6. Requires `project.id` to be provided for updates

The read and the write happen inside one transaction, so a concurrent save cannot interleave between them. The store key path is `id`, so two records with the same id cannot coexist: repeated saves overwrite rather than duplicate.

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

## Duplicated projects

**Deduplication is not the mechanism, and it is not the fix.** The store uses `keyPath: 'id'`, so IndexedDB itself forbids two records sharing an ID, and every write is a `put` on an explicit key. Two saves of the same ID overwrite; they cannot duplicate. `dedupeById` in `getLocalProjects` is therefore a safety net for records that arrive from outside that guarantee — the legacy `oc_local_projects` payload is a plain JSON array where duplicates are possible — and it is unreachable for records this code wrote.

The duplicates users actually saw were **separate projects with different IDs**, created in the workspace:

- Two paths create a project when none is selected: `useWorkspaceGeneration.startGeneration` and `useWorkspaceBatch.startBatch`.
- A React `StrictMode` double mount in development ran the landing handover effect twice, starting a second generation that created a second project.

Both causes are now handled in `src/features/workspace/`:

- `useWorkspaceEntry` guards the landing handover with an `initialPromptHandled` ref and clears the router state, so the prompt is consumed exactly once per mount even under StrictMode.
- `startGeneration` passes `id: projectId || undefined`, where `projectId` is the current project. A second entry therefore reuses the project instead of creating another one.

The service layer was not involved and needed no change. Do not reach for the dedupe when investigating a duplicate: check the call sites instead.

## Migration

### Legacy database: `OpenContentProjectsDB`

Read by name, every record copied into `projects`, and only then is the old database deleted.

- **Idempotent**: a second run plans no writes, so nothing is duplicated.
- **Non destructive**: if the copy fails, nothing is deleted and the next run retries from the intact legacy database.
- **No silent overwrites**: on an `id` collision the newest record by `updatedAt` (falling back to `createdAt`) wins and the conflict is logged to the console. A tie keeps the stored record.
- Records without an `id` cannot be stored under a key path, so they are reported as skipped rather than dropped silently.
- Every stored and migrated record carries `schemaVersion: 1`.

If the legacy database is still open in another tab, the deletion is reported as not done. The data is already copied, so the leftover is inert and no duplicates appear.

### Legacy localStorage: `oc_local_projects`

Preserved from the previous implementation. The import only runs when the `projects` store is empty, writes the deduplicated payload, and removes the key afterwards. If the write fails, the key is left in place.

Migration runs once per page load, triggered by the first service call. `runLegacyMigration({ force: true })` reruns it on demand.

