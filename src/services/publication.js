/**
 * Publication Queue (local stub)
 * OpenContent IDE
 * 
 * Placeholder for future publishing integrations.
 * Stores publications locally for now.
 */

const STORAGE_KEY = 'oc_publication_queue';

export const queuePublication = (publication) => {
    const item = {
        id: `pub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        status: 'queued',
        channels: publication.channels || [],
        ...publication,
        createdAt: new Date().toISOString()
    };

    let queue = [];
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        queue = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(queue)) queue = [];
    } catch { queue = []; }

    queue.unshift(item);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    return item;
};

export const getPublicationQueue = () => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
};
