/**
 * Minimal in-memory IndexedDB double.
 *
 * It is not a complete implementation: it covers exactly the surface this data
 * layer uses (open + upgrade, read/write transactions, keyPath stores,
 * non-unique indexes, deleteDatabase, onblocked) so the orchestration, the
 * idempotency rules and the failure paths can be exercised without adding a
 * dependency.
 */

const nextTick = (fn) => queueMicrotask(fn);

/**
 * A real IndexedDB transaction stays active while microtasks run and only
 * commits when control returns to the event loop, so request work is queued as
 * a microtask while the commit decision is queued as a macrotask.
 */
const commitWhenIdle = (fn) => setTimeout(fn, 0);

export const createFakeIndexedDb = ({ failPuts = [] } = {}) => {
    // `failPuts` entries are `{ database, store }` or a bare store name, which
    // then fails in every database. Scoping by database lets a test break the
    // unified write path while the legacy database is seeded normally.
    const failAllStores = failPuts.filter((entry) => typeof entry === 'string');
    const failScoped = failPuts.filter((entry) => typeof entry === 'object');
    const shouldFail = (databaseName, storeName) => failAllStores.includes(storeName)
        || failScoped.some((entry) => entry.store === storeName && (entry.database === undefined || entry.database === databaseName));

    const databases = new Map();

    const runRequest = (request, transaction, operation) => {
        if (transaction) transaction.pending += 1;
        nextTick(() => {
            if (transaction && transaction.aborted) {
                request.error = new Error('TransactionInactiveError');
                if (request.onerror) request.onerror({ target: request });
            } else {
                try {
                    request.result = operation();
                    if (request.onsuccess) request.onsuccess({ target: request });
                } catch (error) {
                    request.error = error;
                    if (transaction) transaction.abort();
                    if (request.onerror) request.onerror({ target: request });
                }
            }

            if (!transaction) return;
            transaction.pending -= 1;
            if (transaction.pending === 0 && !transaction.settled) commitWhenIdle(() => transaction.settle());
        });
    };

    const createObjectStore = (databaseName, store, name, transaction) => {
        const keyOf = (record) => record?.[store.keyPath];

        const failIfNeeded = () => {
            if (shouldFail(databaseName, name)) throw new Error('QuotaExceededError: simulated write failure');
        };

        return {
            get indexNames() {
                return { length: store.indexes.size, contains: (indexName) => store.indexes.has(indexName) };
            },
            createIndex(indexName, keyPath, options = {}) {
                if (!store.indexes.has(indexName)) store.indexes.set(indexName, { keyPath, options });
                return { name: indexName, keyPath, unique: Boolean(options.unique) };
            },
            index(indexName) {
                const definition = store.indexes.get(indexName);
                if (!definition) throw new Error(`NotFoundError: index ${indexName}`);
                return {
                    getAll(query) {
                        const request = {};
                        runRequest(request, transaction, () => [...store.records.values()]
                            .filter((record) => record[definition.keyPath] === query));
                        return request;
                    }
                };
            },
            put(record) {
                const request = {};
                runRequest(request, transaction, () => {
                    failIfNeeded();
                    const key = keyOf(record);
                    if (key === undefined || key === null) throw new Error('DataError: record has no key');
                    store.records.set(key, record);
                    return key;
                });
                return request;
            },
            add(record) {
                const request = {};
                runRequest(request, transaction, () => {
                    failIfNeeded();
                    const key = keyOf(record);
                    if (store.records.has(key)) throw new Error('ConstraintError: key already exists');
                    store.records.set(key, record);
                    return key;
                });
                return request;
            },
            get(key) {
                const request = {};
                runRequest(request, transaction, () => store.records.get(key));
                return request;
            },
            getAll() {
                const request = {};
                runRequest(request, transaction, () => [...store.records.values()]);
                return request;
            },
            getAllKeys() {
                const request = {};
                runRequest(request, transaction, () => [...store.records.keys()]);
                return request;
            },
            delete(key) {
                const request = {};
                runRequest(request, transaction, () => { store.records.delete(key); });
                return request;
            },
            count() {
                const request = {};
                runRequest(request, transaction, () => store.records.size);
                return request;
            },
            clear() {
                const request = {};
                runRequest(request, transaction, () => { store.records.clear(); });
                return request;
            }
        };
    };

    const createTransaction = (record, names, mode) => {
        const missing = names.filter((name) => !record.stores.has(name));
        if (missing.length > 0) throw new Error(`NotFoundError: ${missing.join(', ')}`);

        const snapshot = new Map();
        record.stores.forEach((store, name) => snapshot.set(name, new Map(store.records)));

        const transaction = {
            mode,
            pending: 0,
            aborted: false,
            settled: false,
            error: null,
            oncomplete: null,
            onerror: null,
            onabort: null,
            objectStore(storeName) {
                return createObjectStore(record.name, record.stores.get(storeName), storeName, transaction);
            },
            abort() {
                if (this.settled) throw new Error('InvalidStateError');
                this.aborted = true;
                snapshot.forEach((records, name) => { record.stores.get(name).records = records; });
                this.settle();
            },
            settle() {
                if (this.settled) return;
                this.settled = true;
                if (this.aborted) {
                    if (this.onabort) this.onabort({ target: this });
                    return;
                }
                if (this.oncomplete) this.oncomplete({ target: this });
            }
        };

        commitWhenIdle(() => {
            if (transaction.pending === 0 && !transaction.settled) transaction.settle();
        });

        return transaction;
    };

    const createDatabaseApi = (record) => {
        const api = {
            onversionchange: null,
            onclose: null,
            get name() { return record.name; },
            get version() { return record.version; },
            get objectStoreNames() {
                return { length: record.stores.size, contains: (name) => record.stores.has(name) };
            },
            createObjectStore(storeName, options = {}) {
                record.stores.set(storeName, {
                    keyPath: options.keyPath ?? null,
                    records: new Map(),
                    indexes: new Map()
                });
                return createObjectStore(record.name, record.stores.get(storeName), storeName, null);
            },
            close() {
                record.openConnections = Math.max(0, record.openConnections - 1);
                if (api.onclose) api.onclose();
            }
        };

        // `db.transaction` is a callable that also exposes the active version
        // change transaction during an upgrade, as in the real API.
        const transaction = (names, mode = 'readonly') => createTransaction(record, Array.isArray(names) ? names : [names], mode);
        transaction.objectStore = (storeName) => {
            if (!record.upgradeTransaction) throw new Error('InvalidStateError: no upgrade transaction');
            return record.upgradeTransaction.objectStore(storeName);
        };
        api.transaction = transaction;
        return api;
    };

    const open = (name, version) => {
        const request = { onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null, result: undefined, error: null };

        nextTick(() => {
            const existing = databases.get(name);
            const isNew = !existing;
            const needsUpgrade = version !== undefined && (!existing || version > existing.version);

            if (isNew) {
                databases.set(name, { name, version: version ?? 1, stores: new Map(), openConnections: 0, upgradeTransaction: null });
            } else if (needsUpgrade) {
                existing.version = version;
            }

            const record = databases.get(name);
            record.openConnections += 1;
            const api = createDatabaseApi(record);

            request.result = api;
            if (isNew || needsUpgrade) {
                record.upgradeTransaction = createTransaction(record, [...record.stores.keys()], 'versionchange');
                if (request.onupgradeneeded) request.onupgradeneeded({ target: api });
                record.upgradeTransaction = null;
            }

            if (request.onsuccess) request.onsuccess({ target: request });
        });

        return request;
    };

    const deleteDatabase = (name) => {
        const request = { onsuccess: null, onerror: null, onblocked: null };

        nextTick(() => {
            const record = databases.get(name);
            if (!record) {
                if (request.onsuccess) request.onsuccess({ target: request });
                return;
            }
            if (record.openConnections > 0) {
                if (request.onblocked) request.onblocked({ target: request });
                return;
            }
            databases.delete(name);
            if (request.onsuccess) request.onsuccess({ target: request });
        });

        return request;
    };

    return {
        open,
        deleteDatabase,
        databases: async () => [...databases.values()].map((record) => ({ name: record.name, version: record.version })),
        databaseNames: () => [...databases.keys()],
        recordsOf: (databaseName, storeName) => [...(databases.get(databaseName)?.stores.get(storeName)?.records.values() ?? [])]
    };
};

/**
 * Creates a legacy database and fills its store, imitating the code that used
 * to own it before the unification.
 */
export const seedLegacyDatabase = (fake, name, storeName, records, indexNames = []) => {
    return new Promise((resolve, reject) => {
        const request = fake.open(name, 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            const store = db.createObjectStore(storeName, { keyPath: 'id' });
            indexNames.forEach((indexName) => store.createIndex(indexName, indexName, { unique: false }));
        };
        request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            records.forEach((record) => store.put(record));
            transaction.oncomplete = () => { db.close(); resolve(); };
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error ?? new Error('seed aborted'));
        };
        request.onerror = () => reject(request.error);
    });
};
