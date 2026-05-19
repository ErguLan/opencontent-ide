/**
 * Projects Local Service (IndexedDB)
 * Stores all projects locally to avoid cloud dependency.
 */

const DB_NAME = 'OpenContentProjectsDB';
const DB_VERSION = 1;
const STORE_NAME = 'projects';
const LEGACY_STORAGE_KEY = 'oc_local_projects';

const safeParseProjects = (raw) => {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

const sortByUpdatedAtDesc = (items) => {
    return [...items].sort((a, b) => {
        const aTime = new Date(a?.updatedAt || a?.createdAt || 0).getTime();
        const bTime = new Date(b?.updatedAt || b?.createdAt || 0).getTime();
        return bTime - aTime;
    });
};

const uniqueById = (items) => {
    const map = new Map();
    for (const item of items) {
        if (!item || !item.id) continue;
        const existing = map.get(item.id);
        if (!existing) {
            map.set(item.id, item);
            continue;
        }

        const existingTime = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
        const incomingTime = new Date(item.updatedAt || item.createdAt || 0).getTime();
        if (incomingTime >= existingTime) {
            map.set(item.id, item);
        }
    }
    return Array.from(map.values());
};

const openDb = () => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

const txDone = (tx) => {
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    });
};

const migrateLegacyLocalStorageIfNeeded = async (db) => {
    const tx = db.transaction([STORE_NAME], 'readonly');
    const store = tx.objectStore(STORE_NAME);

    const count = await new Promise((resolve, reject) => {
        const req = store.count();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
    await txDone(tx);

    if (count > 0) return;

    const legacyProjects = safeParseProjects(localStorage.getItem(LEGACY_STORAGE_KEY));
    if (legacyProjects.length === 0) return;

    const writeTx = db.transaction([STORE_NAME], 'readwrite');
    const writeStore = writeTx.objectStore(STORE_NAME);
    uniqueById(legacyProjects).forEach((project) => {
        if (project?.id) writeStore.put(project);
    });
    await txDone(writeTx);

    localStorage.removeItem(LEGACY_STORAGE_KEY);
};

const withDb = async (work) => {
    const db = await openDb();
    await migrateLegacyLocalStorageIfNeeded(db);
    return work(db);
};

export const getLocalProjects = async () => {
    return withDb((db) => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction([STORE_NAME], 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const req = store.getAll();

            req.onsuccess = () => resolve(sortByUpdatedAtDesc(uniqueById(req.result || [])));
            req.onerror = () => reject(req.error);
        });
    });
};

export const saveLocalProject = async (project) => {
    if (!project) return null;

    return withDb((db) => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction([STORE_NAME], 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const projectId = project.id || `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

            const getReq = store.get(projectId);
            getReq.onerror = () => reject(getReq.error);
            getReq.onsuccess = () => {
                const existing = getReq.result;
                const nowIso = new Date().toISOString();
                const newProject = {
                    ...(existing || {}),
                    ...project,
                    id: projectId,
                    createdAt: existing?.createdAt || project.createdAt || nowIso,
                    updatedAt: nowIso
                };

                const putReq = store.put(newProject);
                putReq.onsuccess = () => resolve(newProject);
                putReq.onerror = () => reject(putReq.error);
            };
        });
    });
};

export const deleteLocalProject = async (projectId) => {
    if (!projectId) return false;

    return withDb((db) => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction([STORE_NAME], 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const req = store.delete(projectId);
            req.onsuccess = () => resolve(true);
            req.onerror = () => reject(req.error);
        });
    });
};
