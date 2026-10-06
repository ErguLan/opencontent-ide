/**
 * Media Service (IndexedDB)
 * OpenContent IDE
 *
 * Manages local storage for high-quality images without hitting LocalStorage limits (5MB)
 * Uses IndexedDB to store Blobs/Base64 locally.
 *
 * Data lives in the unified `OpenContentDB` (`user-assets` store). The public
 * API of this module is unchanged.
 *
 * The `status` field of an asset is its delivery state (draft, in-review,
 * approved, published), not a job status. Legacy assets written before the
 * delivery model existed carry values such as `completed`; those are read and
 * written as `draft` so nothing breaks and nothing lies about the asset.
 */

import { MEDIA_STORE } from './db/schema.js';
import { ensureDatabaseReady } from './db/migration.js';
import { add, count, deleteRecord, get, getAll, withTransaction } from './db/access.js';
import { resolveDeliveryState, validateTransition } from './delivery/deliveryState.js';

const withDb = async (work) => {
    await ensureDatabaseReady();
    return work();
};

/**
 * Saves a file to IndexedDB
 * @param {File|Blob} file - The file to save
 * @param {string} name - File name
 * @returns {Promise<object>} Saved asset info
 */
export const saveMedia = async (file, name, options = {}) => {
    const id = `asset_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    // Convert to Base64 for easier preview and API handling
    const base64 = await fileToBase64(file);

    const asset = {
        id,
        name: name || file.name,
        type: file.type,
        data: base64, // We store as base64 for simplicity in this version, could be Blob
        role: options.role || 'reference',
        tags: Array.isArray(options.tags) ? options.tags : [],
        projectId: options.projectId || null,
        versionId: options.versionId || null,
        kind: options.kind || (options.source === 'generated' ? 'generated' : 'source'),
        source: options.source || 'upload',
        model: options.model || null,
        prompt: options.prompt || null,
        parameters: options.parameters || {},
        version: options.version || null,
        status: resolveDeliveryState(options.status),
        comments: options.comments || [],
        referenceAssetIds: Array.isArray(options.referenceAssetIds) ? options.referenceAssetIds : [],
        location: options.location || 'project',
        parentAssetId: options.parentAssetId || null,
        createdAt: new Date().toISOString()
    };

    await withDb(() => add(MEDIA_STORE, asset));

    return asset;
};

/**
 * Retrieves all saved assets
 */
export const getAllMedia = async () => {
    return withDb(() => getAll(MEDIA_STORE));
};

/**
 * Deletes an asset by ID
 */
export const deleteMedia = async (id) => {
    return withDb(() => deleteRecord(MEDIA_STORE, id));
};

export const getMedia = async (id) => {
    if (!id) return null;
    const record = await withDb(() => get(MEDIA_STORE, id));
    return record || null;
};

/**
 * Updates metadata for an existing asset
 *
 * `updates.status` is the delivery state of the asset and follows the same
 * state machine as artifacts: forward transitions only, `published` is
 * terminal. An illegal move rejects and leaves the stored asset untouched.
 */
export const updateMediaMetadata = async (id, updates = {}) => {
    return withDb(() => withTransaction(MEDIA_STORE, 'readwrite', async (stores) => {
        const store = stores[MEDIA_STORE];

        const current = await new Promise((resolve, reject) => {
            const getRequest = store.get(id);
            getRequest.onsuccess = () => resolve(getRequest.result);
            getRequest.onerror = () => reject(getRequest.error);
        });

        if (!current) return null;

        const nextUpdates = { ...updates };
        if (Object.prototype.hasOwnProperty.call(nextUpdates, 'status')) {
            validateTransition(resolveDeliveryState(current.status), nextUpdates.status);
        }

        const nextAsset = {
            ...current,
            ...nextUpdates,
            updatedAt: new Date().toISOString()
        };

        await new Promise((resolve, reject) => {
            const putRequest = store.put(nextAsset);
            putRequest.onsuccess = () => resolve();
            putRequest.onerror = () => reject(putRequest.error);
        });

        return nextAsset;
    }));
};

/**
 * Counts total saved assets
 */
export const countMedia = async () => {
    return withDb(() => count(MEDIA_STORE));
};

/**
 * Helper: Converts File/Blob to Base64
 */
export const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = (error) => reject(error);
    });
};