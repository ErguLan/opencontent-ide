/**
 * Agentic mode persistence.
 *
 * Kept out of the component file so the toggle module only exports a component.
 */

const AGENTIC_STORAGE_KEY = 'oc_agentic_mode';

export function getAgenticMode() {
    return localStorage.getItem(AGENTIC_STORAGE_KEY) === 'true';
}

export function setAgenticMode(enabled) {
    localStorage.setItem(AGENTIC_STORAGE_KEY, enabled ? 'true' : 'false');
}
