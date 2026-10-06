/**
 * Thin access layer over the unified database.
 *
 * These helpers know nothing about products, only about stores. They are the
 * single place that talks to IndexedDB transactions, which keeps the service
 * files free of ceremony and makes cross-domain transactions possible.
 */

import { getConnection } from './connection.js';
import { isKnownStore } from './schema.js';
import { normalizeRecord } from './records.js';

export class UnknownStoreError extends Error {
    constructor(storeName) {
        super(`Unknown object store "${storeName}". Use one of the stores declared in src/services/db/schema.js.`);
        this.name = 'UnknownStoreError';
        this.code = 'UNKNOWN_STORE';
    }
}

const assertStore = (storeName) => {
    if (!isKnownStore(storeName)) throw new UnknownStoreError(storeName);
};

const requestToPromise = (request) => new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
});

export const transactionDone = (transaction) => new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('TRANSACTION_ABORTED'));
});

/**
 * Runs `work` inside a single transaction over the given stores.
 *
 * `work` receives a `{ [storeName]: IDBObjectStore }` map and may return a
 * value that becomes the result of this call. The transaction commits when
 * `work` resolves, so every read and write it issued is atomic together.
 *
 * Use it to span domains, for example removing a project together with its
 * artifacts and media so a crash can never leave orphans behind.
 */
export const withTransaction = async (storeNames, mode, work) => {
    const names = Array.isArray(storeNames) ? storeNames : [storeNames];
    names.forEach(assertStore);

    const db = await getConnection();
    const transaction = db.transaction(names, mode);
    const stores = {};
    names.forEach((storeName) => {
        stores[storeName] = transaction.objectStore(storeName);
    });

    const completion = transactionDone(transaction);
    let result;
    try {
        result = await work(stores, transaction);
    } catch (error) {
        try {
            transaction.abort();
        } catch {
            // The transaction may already be finished; the completion promise
            // below still settles.
        }
        await completion.catch(() => {});
        throw error;
    }

    await completion;
    return result;
};

/** Reads one record by key. Resolves to undefined when absent. */
export const get = async (storeName, key) => {
    assertStore(storeName);
    const db = await getConnection();
    const transaction = db.transaction(storeName, 'readonly');
    const result = await requestToPromise(transaction.objectStore(storeName).get(key));
    return result;
};

/** Reads every record in a store. */
export const getAll = async (storeName) => {
    assertStore(storeName);
    const db = await getConnection();
    const transaction = db.transaction(storeName, 'readonly');
    const result = await requestToPromise(transaction.objectStore(storeName).getAll());
    return result || [];
};

/**
 * Reads only the keys present in a store.
 * Useful to detect which records a merge would actually collide with without
 * loading every value, which matters for stores holding large base64 media.
 */
export const getAllKeys = async (storeName) => {
    assertStore(storeName);
    const db = await getConnection();
    const transaction = db.transaction(storeName, 'readonly');
    const result = await requestToPromise(transaction.objectStore(storeName).getAllKeys());
    return result || [];
};

/** Reads every record in a store whose index entry equals `query`. */
export const getAllByIndex = (storeName, indexName, query) => {
    assertStore(storeName);
    return withTransaction(storeName, 'readonly', (stores) => {
        const index = stores[storeName].index(indexName);
        return requestToPromise(index.getAll(query));
    });
};

/** Writes a record, stamping the schema version. Existing keys are replaced. */
export const put = (storeName, record) => {
    const normalized = normalizeRecord(record);
    if (!normalized) throw new Error('put() requires a record with an id');

    return withTransaction(storeName, 'readwrite', async (stores) => {
        await requestToPromise(stores[storeName].put(normalized));
        return normalized;
    });
};

/** Writes a record and fails when the key already exists. */
export const add = (storeName, record) => {
    const normalized = normalizeRecord(record);
    if (!normalized) throw new Error('add() requires a record with an id');

    return withTransaction(storeName, 'readwrite', async (stores) => {
        await requestToPromise(stores[storeName].add(normalized));
        return normalized;
    });
};

/** Writes many records in a single transaction. */
export const putMany = (storeName, records) => {
    const normalized = records.map(normalizeRecord).filter(Boolean);
    if (normalized.length === 0) return Promise.resolve([]);

    return withTransaction(storeName, 'readwrite', async (stores) => {
        const store = stores[storeName];
        await Promise.all(normalized.map((record) => requestToPromise(store.put(record))));
        return normalized;
    });
};

/** Deletes a record by key. */
export const deleteRecord = (storeName, key) => withTransaction(storeName, 'readwrite', async (stores) => {
    await requestToPromise(stores[storeName].delete(key));
    return true;
});

/** Counts records in a store. */
export const count = (storeName) => withTransaction(storeName, 'readonly', (stores) => (
    requestToPromise(stores[storeName].count())
));

/** Empties a store without deleting it. */
export const clear = (storeName) => withTransaction(storeName, 'readwrite', async (stores) => {
    await requestToPromise(stores[storeName].clear());
    return true;
});

export const db = {
    get,
    getAll,
    getAllKeys,
    getAllByIndex,
    put,
    add,
    putMany,
    delete: deleteRecord,
    count,
    clear,
    withTransaction
};

export default db;