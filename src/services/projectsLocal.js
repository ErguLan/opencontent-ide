/**
 * Projects Local Service (IndexedDB)
 * Stores all projects locally to avoid cloud dependency.
 *
 * Data lives in the unified `OpenContentDB` (`projects` store). The public API
 * of this module is unchanged: the legacy databases are migrated by the db
 * layer on first use.
 */

import { PROJECTS_STORE } from './db/schema.js';
import { ensureDatabaseReady } from './db/migration.js';
import { deleteRecord, get, getAll, withTransaction } from './db/access.js';
import { dedupeById, normalizeRecord, sortByUpdatedAtDesc } from './db/records.js';

const withDb = async (work) => {
    await ensureDatabaseReady();
    return work();
};

export const getLocalProjects = async () => {
    return withDb(async () => {
        const records = await getAll(PROJECTS_STORE);
        return sortByUpdatedAtDesc(dedupeById(records).records);
    });
};

export const getLocalProject = async (projectId) => {
    if (!projectId) return null;

    return withDb(async () => {
        const record = await get(PROJECTS_STORE, projectId);
        return record || null;
    });
};

export const saveLocalProject = async (project) => {
    if (!project) return null;

    return withDb(() => withTransaction(PROJECTS_STORE, 'readwrite', async (stores) => {
        const store = stores[PROJECTS_STORE];
        const projectId = project.id || `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        const existing = await new Promise((resolve, reject) => {
            const getReq = store.get(projectId);
            getReq.onsuccess = () => resolve(getReq.result || null);
            getReq.onerror = () => reject(getReq.error);
        });

        const savedProject = {
            ...(existing || {}),
            ...project,
            id: projectId,
            createdAt: existing?.createdAt || project.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        await new Promise((resolve, reject) => {
            const putReq = store.put(normalizeRecord(savedProject));
            putReq.onsuccess = () => resolve();
            putReq.onerror = () => reject(putReq.error);
        });

        return savedProject;
    }));
};

export const deleteLocalProject = async (projectId) => {
    if (!projectId) return false;

    return withDb(() => deleteRecord(PROJECTS_STORE, projectId));
};