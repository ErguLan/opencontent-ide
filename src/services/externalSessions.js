import { getLocalProject, saveLocalProject } from './projectsLocal';
import { getStoredModels } from './models';

const DEFAULT_SERVER_URL = 'http://localhost:4000';

function getServerUrl() {
    try {
        const settings = JSON.parse(localStorage.getItem('oc_local_save_settings') || '{}');
        return String(settings.serverBaseUrl || DEFAULT_SERVER_URL).replace(/\/$/, '');
    } catch {
        return DEFAULT_SERVER_URL;
    }
}

export async function syncExternalSessions() {
    try {
        const response = await fetch(`${getServerUrl()}/api/sessions`);
        if (!response.ok) return 0;
        const payload = await response.json();
        const sessions = Array.isArray(payload.sessions) ? payload.sessions : [];
        let imported = 0;

        for (const session of sessions) {
            if (!session?.id || !session.prompt || !session.result) continue;
            const existing = await getLocalProject(session.id);
            const externalTime = new Date(session.updatedAt || session.createdAt || 0).getTime();
            const localTime = new Date(existing?.updatedAt || existing?.createdAt || 0).getTime();
            if (existing && localTime >= externalTime) continue;
            await saveLocalProject({ ...session, cloudSynced: false, importedFromExternal: true });
            imported += 1;
        }
        return imported;
    } catch {
        return 0;
    }
}

export async function syncClientConfig({ models, activeTextModel, activeVisionModel, activeImageModel }) {
    try {
        const response = await fetch(`${getServerUrl()}/api/client-config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ models, activeTextModel, activeVisionModel, activeImageModel })
        });
        return response.ok;
    } catch {
        return false;
    }
}

export async function syncBrowserClientConfig({ activeTextModel, activeVisionModel, activeImageModel }) {
    return syncClientConfig({
        models: getStoredModels(),
        activeTextModel,
        activeVisionModel,
        activeImageModel
    });
}
