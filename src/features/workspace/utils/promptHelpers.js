/**
 * Prompt intent heuristics and prompt context builders for the workspace.
 *
 * These helpers only shape the text sent to the model. They are intentionally
 * free of React and of user-facing copy: the workspace injects the translated
 * labels it already owns.
 */

const VISUAL_REQUEST_PATTERN = /(image|imagen|photo|foto|thumbnail|poster|cover|banner|visual|design|disena|logo|ilustracion|render|mockup)/;
const EDIT_ACTION_PATTERN = /(edita|editar|edit|retoca|retouch|modifica|modify|ajusta|improve|mejora|cambia|change|aplica|apply|pon|put)/;
const EDIT_VISUAL_CONTEXT_PATTERN = /(imagen|image|template|visual|foto|photo|diseno|estilo|style|color|iluminacion|lighting|fondo|background|efecto|effect)/;

const CASUAL_GREETING_PATTERN = /^(hola|hello|hi|hey|que onda|que tal|buenas|buen dia|buenos dias|buenas tardes|buenas noches)$/;
const CASUAL_SHORT_PATTERN = /^(hola|hello|hi|hey|gracias|thanks|ok|vale|va|listo)$/;

const toLower = (value) => String(value || '').toLowerCase();

export const isCasualChatPrompt = (promptText) => {
    const text = toLower(promptText).trim();
    const compact = text.replace(/[!?.:,;]/g, '').trim();
    const tokens = compact.split(/\s+/).filter(Boolean);
    const greetingOnly = CASUAL_GREETING_PATTERN.test(compact);
    const shortCasual = CASUAL_SHORT_PATTERN.test(compact) || tokens.length <= 2;
    return greetingOnly || shortCasual;
};

export const isImageEditRequest = (promptText) => {
    const text = toLower(promptText);
    const hasAction = EDIT_ACTION_PATTERN.test(text);
    const hasVisualContext = EDIT_VISUAL_CONTEXT_PATTERN.test(text);
    return hasAction && hasVisualContext;
};

export const shouldAllowAutoImage = (promptText, hasAttachedImage) => {
    if (hasAttachedImage) return true;
    return VISUAL_REQUEST_PATTERN.test(toLower(promptText));
};

export const getSafeVersionIndex = (index, list) => {
    if (!Array.isArray(list) || list.length === 0) return -1;
    const normalized = Number.isInteger(index) ? index : list.length - 1;
    return Math.min(Math.max(normalized, 0), list.length - 1);
};

export const getScopedHistory = (allHistory, versionIndex) => {
    if (!Array.isArray(allHistory) || allHistory.length === 0 || versionIndex < 0) return [];
    const maxEntries = (versionIndex + 1) * 2;
    return allHistory.slice(0, Math.min(allHistory.length, maxEntries));
};

export const buildHistoryContext = (scopedHistory) => scopedHistory
    .map((item) => `${item.role === 'user' ? 'User' : 'Assistant'}: ${item.content}`)
    .join('\n\n');

export const toMillis = (value) => {
    if (!value) return 0;
    if (typeof value === 'number') return value;
    if (value instanceof Date) return value.getTime();
    if (typeof value?.toDate === 'function') return value.toDate().getTime();
    if (typeof value?.seconds === 'number') return value.seconds * 1000;
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
};

export const downloadImageFromUrl = async (url) => {
    if (!url) return;
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = `opencontent-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
        console.error('Download failed:', error);
        window.open(url, '_blank');
    }
};

export const downloadJsonFile = (payload, filename) => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};
