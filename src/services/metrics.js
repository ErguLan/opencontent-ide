/**
 * Metrics Service (local-only, optional)
 * OpenContent IDE
 * 
 * Disabled by default. Enable in .env with VITE_ENABLE_METRICS=true
 */

const ENABLED = import.meta.env.VITE_ENABLE_METRICS === 'true';
const STORAGE_KEY = 'oc_metrics_events';
const MAX_EVENTS = 500;

export const trackMetric = (eventName, payload = {}) => {
    if (!ENABLED) return { id: 'noop', event: eventName };

    const event = {
        id: `metric_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        event: eventName,
        payload,
        createdAt: new Date().toISOString()
    };

    let events = [];
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        events = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(events)) events = [];
    } catch { events = []; }

    events.unshift(event);
    if (events.length > MAX_EVENTS) events = events.slice(0, MAX_EVENTS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
    return event;
};

export const getMetrics = () => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
};
