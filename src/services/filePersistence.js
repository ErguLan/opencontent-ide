import { STORAGE_KEYS } from '../config/constants';

const DEFAULT_SETTINGS = {
    version: 1,
    mode: 'project',
    autoSaveGeneratedImages: true,
    requireApproval: true,
    allowLocalWrites: false,
    allowOverwrite: false,
    allowMultipleImages: true,
    maxImagesPerTask: 4,
    filenameTemplate: '{project}-v{version}-{kind}-{date}.{ext}',
    serverBaseUrl: 'http://localhost:4000',
    serverEnabled: false
};

let directoryHandle = null;

export function getLocalSaveSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_SAVE_SETTINGS) || '{}');
        return { ...DEFAULT_SETTINGS, ...saved };
    } catch {
        return { ...DEFAULT_SETTINGS };
    }
}

export function saveLocalSaveSettings(updates = {}) {
    const next = { ...getLocalSaveSettings(), ...updates, version: 1 };
    localStorage.setItem(STORAGE_KEYS.LOCAL_SAVE_SETTINGS, JSON.stringify(next));
    return next;
}

export function sanitizeFilename(value, fallback = 'opencontent-artifact') {
    const sanitized = String(value || fallback)
        .replace(/[<>:"/\\|?*]/g, '-')
        .split('')
        .filter((character) => character.charCodeAt(0) >= 32)
        .join('')
        .replace(/[. ]+$/g, '')
        .trim();
    const reserved = /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(sanitized) ? `_${sanitized}` : sanitized;
    return (reserved || fallback).slice(0, 180);
}

export function getExtensionFromMime(type = 'image/png') {
    const mimeMap = {
        'image/jpeg': 'jpg',
        'image/webp': 'webp',
        'image/svg+xml': 'svg',
        'image/gif': 'gif',
        'image/avif': 'avif'
    };
    return mimeMap[type] || 'png';
}

export function renderFilename(template, values = {}) {
    const extension = values.ext || getExtensionFromMime(values.type);
    const rendered = String(template || DEFAULT_SETTINGS.filenameTemplate).replace(
        /\{(project|projectId|version|versionId|kind|model|date|time|timestamp|ext)\}/g,
        (_, token) => token === 'ext' ? extension : values[token] ?? ''
    );
    return sanitizeFilename(rendered, `opencontent-${Date.now()}.${extension}`);
}

export async function chooseLocalDirectory() {
    if (typeof window === 'undefined' || typeof window.showDirectoryPicker !== 'function') {
        throw new Error('FILE_SYSTEM_ACCESS_NOT_SUPPORTED');
    }
    directoryHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    return directoryHandle.name;
}

export function clearLocalDirectory() {
    directoryHandle = null;
}

async function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return { mode: 'browser-download', filename };
}

async function writeToDirectory(blob, filename, settings) {
    if (!directoryHandle) throw new Error('LOCAL_DIRECTORY_NOT_SELECTED');
    const permission = await directoryHandle.queryPermission({ mode: 'readwrite' });
    if (permission !== 'granted') {
        const requested = await directoryHandle.requestPermission({ mode: 'readwrite' });
        if (requested !== 'granted') throw new Error('LOCAL_DIRECTORY_PERMISSION_DENIED');
    }
    if (!settings.allowOverwrite) {
        try {
            await directoryHandle.getFileHandle(filename);
            return { mode: 'overwrite-blocked', filename };
        } catch (error) {
            if (error?.name !== 'NotFoundError') throw error;
        }
    }
    const fileHandle = await directoryHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    return { mode: 'configured-directory', filename, directory: directoryHandle.name };
}

async function writeToLocalServer(blob, filename, settings, metadata = {}) {
    const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
    const response = await fetch(`${settings.serverBaseUrl.replace(/\/$/, '')}/api/storage/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, data, metadata })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `STORAGE_HTTP_${response.status}`);
    return { mode: 'local-server', filename, path: result.path };
}

export async function persistImageArtifact(blob, {
    filename,
    metadata = {},
    settings = getLocalSaveSettings(),
    approved = false
} = {}) {
    if (!blob) throw new Error('IMAGE_BLOB_REQUIRED');
    if (settings.requireApproval && !approved && settings.mode !== 'project') {
        return { mode: 'approval-required', filename };
    }
    if (settings.mode === 'project') return { mode: 'project', filename };
    if (settings.mode === 'configured-directory') {
        if (!settings.allowLocalWrites) return { mode: 'local-writes-blocked', filename };
        return writeToDirectory(blob, filename, settings);
    }
    if (settings.mode === 'local-server' && settings.serverEnabled) {
        if (!settings.allowLocalWrites) return { mode: 'local-writes-blocked', filename };
        return writeToLocalServer(blob, filename, settings, { ...metadata, allowOverwrite: settings.allowOverwrite });
    }
    return downloadBlob(blob, filename);
}

export async function persistImageUrl(imageUrl, options = {}) {
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error(`IMAGE_FETCH_HTTP_${response.status}`);
    const blob = await response.blob();
    return persistImageArtifact(blob, { ...options, settings: options.settings || getLocalSaveSettings() });
}

export { DEFAULT_SETTINGS as DEFAULT_LOCAL_SAVE_SETTINGS };
