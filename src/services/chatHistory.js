/**
 * Chat History Service — Persistent conversation memory
 * OpenContent IDE
 * 
 * Stores chat conversations per project in IndexedDB.
 * Each message includes role, content, timestamp, model, and skill.
 */

const DB_NAME = 'OpenContentChatDB';
const DB_VERSION = 1;
const STORE_NAME = 'conversations';

let dbInstance = null;

function openDB() {
    if (dbInstance) return Promise.resolve(dbInstance);

    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                store.createIndex('projectId', 'projectId', { unique: false });
                store.createIndex('createdAt', 'createdAt', { unique: false });
            }
        };

        request.onsuccess = (event) => {
            dbInstance = event.target.result;
            resolve(dbInstance);
        };

        request.onerror = () => reject(request.error);
    });
}

/**
 * Save a chat message
 * @param {Object} message - { projectId, role, content, model?, skill?, metadata? }
 * @returns {Promise<Object>} Saved message with id and timestamp
 */
export async function saveChatMessage(message) {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    const entry = {
        ...message,
        projectId: message.projectId || 'global',
        role: message.role || 'user',       // 'user' | 'assistant' | 'system'
        content: message.content || '',
        model: message.model || null,
        skill: message.skill || null,
        metadata: message.metadata || {},
        createdAt: new Date().toISOString()
    };

    return new Promise((resolve, reject) => {
        const request = store.add(entry);
        request.onsuccess = () => { entry.id = request.result; resolve(entry); };
        request.onerror = () => reject(request.error);
    });
}

/**
 * Get chat history for a project
 * @param {string} projectId
 * @param {number} limit - Max messages to return (default 100)
 * @returns {Promise<Array>} Messages sorted by createdAt ascending
 */
export async function getChatHistory(projectId = 'global', limit = 100) {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('projectId');

    return new Promise((resolve, reject) => {
        const request = index.getAll(projectId);
        request.onsuccess = () => {
            let results = request.result || [];
            results.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
            if (results.length > limit) results = results.slice(-limit);
            resolve(results);
        };
        request.onerror = () => reject(request.error);
    });
}

/**
 * Get recent messages formatted for AI context injection
 * Returns last N messages as { role, content } pairs
 * @param {string} projectId
 * @param {number} contextWindow - Number of recent messages to include
 * @returns {Promise<Array<{role: string, content: string}>>}
 */
export async function getChatContext(projectId = 'global', contextWindow = 10) {
    const history = await getChatHistory(projectId, contextWindow);
    return history.map(msg => ({
        role: msg.role,
        content: msg.content
    }));
}

/**
 * Clear chat history for a project
 * @param {string} projectId
 */
export async function clearChatHistory(projectId = 'global') {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('projectId');

    return new Promise((resolve, reject) => {
        const request = index.getAllKeys(projectId);
        request.onsuccess = () => {
            const keys = request.result || [];
            keys.forEach(key => store.delete(key));
            resolve(keys.length);
        };
        request.onerror = () => reject(request.error);
    });
}

/**
 * Get global stats
 * @returns {Promise<{ totalMessages: number, projectCount: number }>}
 */
export async function getChatStats() {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => {
            const all = request.result || [];
            const projectIds = new Set(all.map(m => m.projectId));
            resolve({
                totalMessages: all.length,
                projectCount: projectIds.size
            });
        };
        request.onerror = () => reject(request.error);
    });
}

export default {
    saveChatMessage,
    getChatHistory,
    getChatContext,
    clearChatHistory,
    getChatStats
};
