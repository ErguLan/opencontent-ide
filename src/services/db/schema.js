/**
 * Unified IndexedDB schema.
 *
 * OpenContent IDE keeps every locally persisted domain in ONE database so the
 * app opens a single connection, can run cross-domain transactions and can
 * migrate data coherently.
 *
 * Legacy databases (still readable during migration):
 *   - OpenContentProjectsDB  -> store `projects`
 *   - OpenContentMediaDB      -> store `user-assets`
 *   - OpenContentArtifactsDB  -> store `artifacts`
 */

export const DB_NAME = 'OpenContentDB';
export const DB_VERSION = 1;

/** Record shape version stamped on every migrated/stored record. */
export const SCHEMA_VERSION = 1;

export const PROJECTS_STORE = 'projects';
export const MEDIA_STORE = 'user-assets';
export const ARTIFACTS_STORE = 'artifacts';

export const STORE_DEFINITIONS = Object.freeze({
    [PROJECTS_STORE]: Object.freeze({
        keyPath: 'id',
        indexes: Object.freeze([])
    }),
    [MEDIA_STORE]: Object.freeze({
        keyPath: 'id',
        indexes: Object.freeze([])
    }),
    [ARTIFACTS_STORE]: Object.freeze({
        keyPath: 'id',
        indexes: Object.freeze([
            Object.freeze({ name: 'type', keyPath: 'type', options: Object.freeze({ unique: false }) }),
            Object.freeze({ name: 'projectId', keyPath: 'projectId', options: Object.freeze({ unique: false }) }),
            Object.freeze({ name: 'updatedAt', keyPath: 'updatedAt', options: Object.freeze({ unique: false }) })
        ])
    })
});

export const STORE_NAMES = Object.freeze(Object.keys(STORE_DEFINITIONS));

export const isKnownStore = (storeName) => Object.prototype.hasOwnProperty.call(STORE_DEFINITIONS, storeName);

/**
 * Creates missing stores and indexes on an `onupgradeneeded` connection.
 * Must run inside the version change transaction, never at runtime.
 */
export const applySchema = (db) => {
    STORE_NAMES.forEach((storeName) => {
        const definition = STORE_DEFINITIONS[storeName];
        const store = db.objectStoreNames.contains(storeName)
            ? db.transaction.objectStore(storeName)
            : db.createObjectStore(storeName, { keyPath: definition.keyPath });

        definition.indexes.forEach((index) => {
            if (!store.indexNames.contains(index.name)) {
                store.createIndex(index.name, index.keyPath, index.options);
            }
        });
    });

    return db;
};