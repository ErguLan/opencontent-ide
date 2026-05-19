/**
 * Media Service (IndexedDB)
 * OpenContent IDE
 * 
 * Manages local storage for high-quality images without hitting LocalStorage limits (5MB)
 * Uses IndexedDB to store Blobs/Base64 locally.
 */

const DB_NAME = 'OpenContentMediaDB';
const DB_VERSION = 1;
const STORE_NAME = 'user-assets';

/**
 * Initializes the IndexedDB database
 */
const initDB = () => {
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

/**
 * Saves a file to IndexedDB
 * @param {File|Blob} file - The file to save
 * @param {string} name - File name
 * @returns {Promise<object>} Saved asset info
 */
export const saveMedia = async (file, name, options = {}) => {
    const db = await initDB();
    const id = `asset_${Date.now()}`;

    // Convert to Base64 for easier preview and API handling
    const base64 = await fileToBase64(file);

    const asset = {
        id,
        name: name || file.name,
        type: file.type,
        data: base64, // We store as base64 for simplicity in this version, could be Blob
        role: options.role || 'reference',
        tags: Array.isArray(options.tags) ? options.tags : [],
        createdAt: new Date().toISOString()
    };

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.add(asset);

        request.onsuccess = () => resolve(asset);
        request.onerror = () => reject(request.error);
    });
};

/**
 * Retrieves all saved assets
 */
export const getAllMedia = async () => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

/**
 * Deletes an asset by ID
 */
export const deleteMedia = async (id) => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);

        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
    });
};

/**
 * Updates metadata for an existing asset
 */
export const updateMediaMetadata = async (id, updates = {}) => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const getRequest = store.get(id);

        getRequest.onerror = () => reject(getRequest.error);
        getRequest.onsuccess = () => {
            const current = getRequest.result;
            if (!current) {
                resolve(null);
                return;
            }

            const nextAsset = {
                ...current,
                ...updates,
                updatedAt: new Date().toISOString()
            };

            const putRequest = store.put(nextAsset);
            putRequest.onsuccess = () => resolve(nextAsset);
            putRequest.onerror = () => reject(putRequest.error);
        };
    });
};

/**
 * Counts total saved assets
 */
export const countMedia = async () => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.count();

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
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
