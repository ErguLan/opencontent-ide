/**
 * Public entry point for local persistence.
 *
 * Every locally persisted domain (projects, media, artifacts) shares one
 * IndexedDB database, `OpenContentDB`, opened through a single cached
 * connection. Import the generic helpers from here; the domain services
 * (`projectsLocal.js`, `mediaService.js`, `artifacts/artifactEngine.js`) are the
 * ones with product meaning.
 *
 * Layout:
 *   - `schema.js`      database name, version, stores and indexes
 *   - `connection.js`  single cached connection, blocked/versionchange handling
 *   - `access.js`      thin get/put/delete/getAll/getAllByIndex/transaction layer
 *   - `records.js`     pure record helpers (dedupe, collisions, normalization)
 *   - `migration.js`   legacy database and localStorage migration
 */

export {
    DB_NAME,
    DB_VERSION,
    SCHEMA_VERSION,
    PROJECTS_STORE,
    MEDIA_STORE,
    ARTIFACTS_STORE,
    STORE_DEFINITIONS,
    STORE_NAMES,
    applySchema,
    isKnownStore
} from './schema.js';

export {
    DatabaseUnavailableError,
    getConnection,
    tryGetConnection,
    closeConnection
} from './connection.js';

export {
    UnknownStoreError,
    db,
    get,
    getAll,
    getAllKeys,
    getAllByIndex,
    put,
    add,
    putMany,
    deleteRecord,
    count,
    clear,
    withTransaction,
    transactionDone
} from './access.js';

export {
    toMillis,
    recordTimestamp,
    sortByUpdatedAtDesc,
    normalizeRecord,
    normalizeRecords,
    dedupeById,
    resolveCollision,
    planMerge
} from './records.js';

export {
    LEGACY_PROJECTS_STORAGE_KEY,
    LEGACY_SOURCES,
    listDatabaseNames,
    readLegacyRecords,
    migrateLegacyDatabase,
    migrateLegacyLocalStorageProjects,
    runLegacyMigration,
    resetMigrationState,
    ensureDatabaseReady
} from './migration.js';