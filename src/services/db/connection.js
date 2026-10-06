/**
 * Single cached connection to the unified OpenContentDB.
 *
 * Only one connection is opened per page. If another tab needs a schema
 * upgrade, `onversionchange` closes this connection so the upgrade is never
 * blocked, and the next call transparently reopens it.
 */

import { DB_NAME, DB_VERSION, applySchema } from './schema.js';

const DB_UNAVAILABLE_MESSAGE = [
    'IndexedDB is not available, so local storage is disabled.',
    'OpenContent IDE keeps projects, media and artifacts in the browser database.',
    'This usually means private/incognito mode, blocked site data, or a non-browser runtime.',
    'Allow site data for this origin and reload to restore local persistence.'
].join(' ');

export class DatabaseUnavailableError extends Error {
    constructor(message = DB_UNAVAILABLE_MESSAGE) {
        super(message);
        this.name = 'DatabaseUnavailableError';
        this.code = 'INDEXEDDB_UNAVAILABLE';
    }
}

/**
 * How long an open request waits when another connection blocks the upgrade.
 * Our own connections close themselves on `onversionchange`, so blocking only
 * happens against a tab running an older build. Waiting forever would hang the
 * app, so we give up with an actionable error instead.
 */
const BLOCKED_TIMEOUT_MS = 5000;

let connectionPromise = null;

const hasIndexedDB = () => typeof indexedDB !== 'undefined' && indexedDB !== null;

const openConnection = () => {
    if (!hasIndexedDB()) {
        return Promise.reject(new DatabaseUnavailableError());
    }

    return new Promise((resolve, reject) => {
        let request;
        try {
            request = indexedDB.open(DB_NAME, DB_VERSION);
        } catch (error) {
            reject(new DatabaseUnavailableError(`${DB_UNAVAILABLE_MESSAGE} (${error?.message || error})`));
            return;
        }

        let blockedTimer = null;
        let givenUp = false;

        request.onupgradeneeded = () => {
            applySchema(request.result);
        };

        request.onsuccess = () => {
            if (blockedTimer) clearTimeout(blockedTimer);
            if (givenUp) {
                // The blocking tab closed after we gave up. Do not leak a
                // connection nobody is holding.
                request.result.close();
                return;
            }
            resolve(request.result);
        };

        request.onblocked = () => {
            console.warn(`[db] ${DB_NAME} upgrade is blocked by another open tab. Waiting up to ${BLOCKED_TIMEOUT_MS}ms.`);
            blockedTimer = setTimeout(() => {
                givenUp = true;
                reject(new DatabaseUnavailableError(
                    `${DB_NAME} could not be opened because another tab is holding an older version open. `
                    + 'Close other OpenContent IDE tabs and reload.'
                ));
            }, BLOCKED_TIMEOUT_MS);
        };

        request.onerror = () => {
            if (blockedTimer) clearTimeout(blockedTimer);
            reject(request.error);
        };
    });
};

/** Drops the cached connection. Exposed for tests and for hard resets. */
export const closeConnection = () => {
    const pending = connectionPromise;
    connectionPromise = null;
    if (!pending) return Promise.resolve();

    return pending.then((db) => {
        db.close();
    }).catch(() => {});
};

/**
 * Returns the shared connection, opening it on first use.
 * Rejects with DatabaseUnavailableError when IndexedDB cannot be used.
 */
export const getConnection = () => {
    if (!connectionPromise) {
        connectionPromise = openConnection().then((db) => {
            db.onversionchange = () => {
                db.close();
                connectionPromise = null;
            };
            db.onclose = () => {
                if (connectionPromise) {
                    connectionPromise.then((current) => {
                        if (current === db) connectionPromise = null;
                    }).catch(() => {});
                }
            };
            return db;
        }).catch((error) => {
            connectionPromise = null;
            throw error;
        });
    }

    return connectionPromise;
};

/**
 * Same as getConnection but resolves to null when IndexedDB is unavailable.
 * Used by the migration runner so a missing database is reported as a result
 * instead of as a thrown error.
 */
export const tryGetConnection = async () => {
    try {
        return await getConnection();
    } catch (error) {
        if (error instanceof DatabaseUnavailableError) return null;
        throw error;
    }
};