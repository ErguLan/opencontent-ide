/**
 * Legacy database migration.
 *
 * OpenContent IDE used to open one IndexedDB database per domain. They are
 * unified into `OpenContentDB`, and this module brings the old data over.
 *
 * Rules enforced here:
 *   - Idempotent: a second run copies nothing new and never duplicates.
 *   - Non destructive: a legacy database is deleted only after every record
 *     was written and its transaction committed. A failure mid-way leaves the
 *     legacy database intact so the next run retries it.
 *   - No silent overwrites: id collisions keep the newest record by timestamp
 *     and the conflict is reported.
 */

import { DB_NAME, PROJECTS_STORE, MEDIA_STORE, ARTIFACTS_STORE } from './schema.js';
import { getConnection, tryGetConnection } from './connection.js';
import { count, getAllKeys, putMany, transactionDone, withTransaction } from './index.js';
import { normalizeRecords, planMerge } from './records.js';

/** Legacy localStorage key still honoured by the projects service. */
export const LEGACY_PROJECTS_STORAGE_KEY = 'oc_local_projects';

export const LEGACY_SOURCES = Object.freeze([
    Object.freeze({ name: 'OpenContentProjectsDB', store: PROJECTS_STORE, target: PROJECTS_STORE }),
    Object.freeze({ name: 'OpenContentMediaDB', store: MEDIA_STORE, target: MEDIA_STORE }),
    Object.freeze({ name: 'OpenContentArtifactsDB', store: ARTIFACTS_STORE, target: ARTIFACTS_STORE })
]);

const requestToPromise = (request) => new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
});

const deleteDatabase = (name) => new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
        resolve(false);
        return;
    }

    let settled = false;
    const finish = (deleted) => {
        if (settled) return;
        settled = true;
        resolve(deleted);
    };

    // A database still open in another tab blocks deletion. We resolve instead
    // of hanging, and the caller decides whether that is a problem.
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => finish(true);
    request.onerror = () => finish(false);
    request.onblocked = () => finish(false);
});

/**
 * Lists database names when the browser supports `indexedDB.databases()`.
 * Returns null when the API is unavailable so callers fall back to probing.
 */
export const listDatabaseNames = async () => {
    if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') return null;
    try {
        const entries = await indexedDB.databases();
        return new Set(entries.map((entry) => entry?.name).filter(Boolean));
    } catch {
        return null;
    }
};

const openLegacyDatabase = (name) => new Promise((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error(`Legacy database "${name}" is blocked by another tab.`));
});

/**
 * Reads a legacy database without destroying anything.
 *
 * `indexedDB.open` creates the database when the name is unknown, so when the
 * name is not listed we open it only to inspect it. A database with zero object
 * stores cannot hold records, so that empty shell is deleted again. A database
 * that has stores but not the expected one is left untouched.
 *
 * Resolves to `{ found: false }` when there is nothing to migrate.
 */
export const readLegacyRecords = async (name, storeName, knownNames) => {
    if (knownNames && !knownNames.has(name)) return { found: false };

    const db = await openLegacyDatabase(name);
    const emptyShell = !db.objectStoreNames.contains(storeName) && db.objectStoreNames.length === 0;

    if (emptyShell) {
        db.close();
        await deleteDatabase(name);
        return { found: false };
    }

    if (!db.objectStoreNames.contains(storeName)) {
        // The database exists with stores we do not own. Never touch it.
        db.close();
        return { found: false };
    }

    try {
        const transaction = db.transaction(storeName, 'readonly');
        const records = await requestToPromise(transaction.objectStore(storeName).getAll());
        await transactionDone(transaction);
        return { found: true, records: records || [] };
    } finally {
        db.close();
    }
};

/**
 * Reads only the stored records the incoming batch would collide with.
 *
 * `user-assets` holds base64 media, so loading the whole store to look for a
 * handful of id matches would cost far more memory than the migration itself.
 */
const readCollidingRecords = async (storeName, incomingRecords) => {
    const storedKeys = new Set(await getAllKeys(storeName));
    const collisions = incomingRecords.filter((record) => storedKeys.has(record.id));
    if (collisions.length === 0) return [];

    return withTransaction(storeName, 'readonly', (stores) => Promise.all(collisions.map((record) => (
        new Promise((resolve, reject) => {
            const request = stores[storeName].get(record.id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        })
    ))));
};

/**
 * Migrates a single legacy database into its target store and returns a report
 * of exactly what happened.
 */
export const migrateLegacyDatabase = async (source, knownNames) => {
    const report = {
        source: source.name,
        store: source.store,
        status: 'skipped',
        migrated: 0,
        conflicts: [],
        invalid: 0,
        sourceDuplicates: 0,
        legacyDeleted: false
    };

    let legacy;
    try {
        legacy = await readLegacyRecords(source.name, source.store, knownNames);
    } catch (error) {
        report.status = 'unreadable';
        report.error = error?.message || String(error);
        return report;
    }

    if (!legacy.found) return report;

    report.status = 'migrated';

    if (legacy.records.length > 0) {
        let plan;
        try {
            const incoming = normalizeRecords(legacy.records);
            plan = planMerge(await readCollidingRecords(source.target, incoming), incoming);
        } catch (error) {
            report.status = 'failed';
            report.error = error?.message || String(error);
            return report;
        }

        if (plan.writes.length > 0) {
            try {
                await putMany(source.target, plan.writes);
            } catch (error) {
                // Nothing was deleted: the legacy database is still complete,
                // so the next run retries this copy from scratch.
                report.status = 'failed';
                report.error = error?.message || String(error);
                return report;
            }
            report.migrated = plan.writes.length;
        }

        report.conflicts = plan.conflicts;
        report.invalid = plan.invalid.length;
        report.sourceDuplicates = plan.sourceDuplicates.length;

        if (plan.conflicts.length > 0) {
            console.warn(
                `[db] ${plan.conflicts.length} id collision(s) migrating ${source.name}. Newest record by timestamp kept.`,
                plan.conflicts
            );
        }
        if (report.sourceDuplicates > 0) {
            console.warn(
                `[db] ${source.name} contained ${report.sourceDuplicates} duplicated id(s). Only the newest copy of each was migrated.`
            );
        }
        if (report.invalid > 0) {
            console.warn(`[db] ${report.invalid} record(s) from ${source.name} had no usable id and were skipped.`);
        }
    }

    // Only now, with every record committed, is the legacy database expendable.
    report.legacyDeleted = await deleteDatabase(source.name);
    if (!report.legacyDeleted) {
        console.warn(
            `[db] Legacy database ${source.name} could not be deleted (another tab may hold it open). `
            + 'Its data is already copied; nothing will be duplicated.'
        );
    }

    return report;
};

const safeParseProjects = (raw) => {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

/**
 * Preserves the legacy `oc_local_projects` localStorage import.
 * It only runs when the projects store is empty, exactly as before unification.
 */
export const migrateLegacyLocalStorageProjects = async () => {
    if (typeof localStorage === 'undefined') return { migrated: 0, status: 'unavailable' };

    const existingCount = await count(PROJECTS_STORE);
    if (existingCount > 0) return { migrated: 0, status: 'skipped' };

    const legacyProjects = safeParseProjects(localStorage.getItem(LEGACY_PROJECTS_STORAGE_KEY));
    if (legacyProjects.length === 0) return { migrated: 0, status: 'empty' };

    const plan = planMerge([], normalizeRecords(legacyProjects));
    if (plan.writes.length === 0) return { migrated: 0, status: 'empty' };

    await putMany(PROJECTS_STORE, plan.writes);
    localStorage.removeItem(LEGACY_PROJECTS_STORAGE_KEY);

    return { migrated: plan.writes.length, conflicts: plan.conflicts, invalid: plan.invalid.length, status: 'migrated' };
};

let migrationPromise = null;

/**
 * Runs every legacy migration once per page load.
 * Concurrent callers share the same run. Pass `{ force: true }` to rerun it.
 *
 * A failed run is not memoized: the next call retries, which is the same rule
 * that keeps an interrupted legacy database from being lost.
 */
export const runLegacyMigration = ({ force = false } = {}) => {
    if (force) migrationPromise = null;
    if (migrationPromise) return migrationPromise;

    const run = (async () => {
        const connection = await tryGetConnection();
        if (!connection) {
            return {
                status: 'unavailable',
                database: DB_NAME,
                migrated: 0,
                sources: [],
                localStorage: { migrated: 0, status: 'unavailable' }
            };
        }

        const knownNames = await listDatabaseNames();
        const sources = [];

        for (const source of LEGACY_SOURCES) {
            sources.push(await migrateLegacyDatabase(source, knownNames));
        }

        let localStorageReport;
        try {
            localStorageReport = await migrateLegacyLocalStorageProjects();
        } catch (error) {
            localStorageReport = { migrated: 0, status: 'failed', error: error?.message || String(error) };
        }

        return {
            status: 'completed',
            database: DB_NAME,
            migrated: sources.reduce((total, source) => total + source.migrated, 0),
            sources,
            localStorage: localStorageReport
        };
    })();

    migrationPromise = run;
    run.catch(() => {
        if (migrationPromise === run) migrationPromise = null;
    });

    return run;
};

/**
 * Guarantees the unified database is open and migrated.
 * Rejects with DatabaseUnavailableError when IndexedDB cannot be used, so the
 * services surface one clear error instead of failing somewhere deeper.
 */
export const ensureDatabaseReady = async () => {
    await getConnection();
    await runLegacyMigration();
};

export const resetMigrationState = () => {
    migrationPromise = null;
};