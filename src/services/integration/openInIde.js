/**
 * Open In Desktop IDE — custom URL scheme integration, contract version 1.
 *
 * A web application cannot call a desktop editor directly. What it can do is
 * build a link the operating system knows how to route:
 *
 *   SCHEME://open?v=1&project=ENCODED&file=ENCODED&line=35&column=4&panel=editor
 *
 * This module is that link, and nothing else. It is pure: no DOM, no fetch, no
 * React, no clock and no i18n, so the contract can be tested on its own.
 *
 * Two rules decide how it is built.
 *
 * 1. Values are always encoded with `URLSearchParams`. Raw concatenation is
 *    forbidden: a space, a `+`, a `%`, a `#`, an `&` or an accent inside a path
 *    would silently change the link, and the receiving application would open
 *    the wrong thing instead of failing.
 * 2. Every produced link is parsed back before it is returned. A builder that
 *    can emit a link its own validator rejects is a builder that ships broken
 *    links.
 *
 * What this module deliberately does NOT do:
 *
 * - It does not claim the desktop app is installed. A web page cannot know
 *   that, so nothing here reports detection, success or failure.
 * - It does not invent a local path. A browser never exposes the real path of a
 *   file it holds in memory: `File.name` is a bare name and a `blob:` URL is not
 *   a path. Paths arrive from the user or from an export the user performed.
 *
 * The scheme and the visible app name are configuration, not branding: a fork
 * sets them (see `getExternalIdeIntegration` in `src/config/constants.js`).
 */

export const OPEN_IN_IDE_CONTRACT_VERSION = '1';
export const OPEN_IN_IDE_ACTION = 'open';
export const OPEN_IN_IDE_MAX_URL_LENGTH = 8192;
export const OPEN_IN_IDE_POSITION_MAX = 2147483647;
export const OPEN_IN_IDE_PANELS = Object.freeze(['editor', 'explorer', 'terminal', 'settings']);
export const OPEN_IN_IDE_PARAMETERS = Object.freeze(['v', 'project', 'file', 'line', 'column', 'panel']);

export const OPEN_IN_IDE_ERROR_CODES = Object.freeze({
    INVALID_URL: 'OPEN_IN_IDE_INVALID_URL',
    SCHEME_REQUIRED: 'OPEN_IN_IDE_SCHEME_REQUIRED',
    SCHEME_INVALID: 'OPEN_IN_IDE_SCHEME_INVALID',
    UNSUPPORTED_ACTION: 'OPEN_IN_IDE_UNSUPPORTED_ACTION',
    UNKNOWN_PARAMETER: 'OPEN_IN_IDE_UNKNOWN_PARAMETER',
    DUPLICATE_PARAMETER: 'OPEN_IN_IDE_DUPLICATE_PARAMETER',
    INVALID_ENCODING: 'OPEN_IN_IDE_INVALID_ENCODING',
    INVALID_VERSION: 'OPEN_IN_IDE_INVALID_VERSION',
    PATH_EMPTY: 'OPEN_IN_IDE_PATH_EMPTY',
    PATH_INVALID: 'OPEN_IN_IDE_PATH_INVALID',
    PATH_NOT_ABSOLUTE: 'OPEN_IN_IDE_PATH_NOT_ABSOLUTE',
    PATH_OUTSIDE_PROJECT: 'OPEN_IN_IDE_PATH_OUTSIDE_PROJECT',
    POSITION_INVALID: 'OPEN_IN_IDE_POSITION_INVALID',
    POSITION_OUT_OF_RANGE: 'OPEN_IN_IDE_POSITION_OUT_OF_RANGE',
    POSITION_REQUIRES_FILE: 'OPEN_IN_IDE_POSITION_REQUIRES_FILE',
    PANEL_UNKNOWN: 'OPEN_IN_IDE_PANEL_UNKNOWN',
    URL_TOO_LONG: 'OPEN_IN_IDE_URL_TOO_LONG'
});

const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*$/i;
const REPLACEMENT_CHARACTER_CODE = 0xFFFD;

// `C:\Users` is a Windows path, not a URL, so a scheme-like prefix needs more
// than the single drive letter.
const URL_LIKE_PREFIX = /^[a-z][a-z0-9+.-]+:/i;
const WINDOWS_ABSOLUTE = /^[a-z]:[\\/]/i;
const POSIX_ABSOLUTE = /^\//;
const DIGITS_ONLY = /^\d+$/;

/**
 * True when a value carries a character no parameter may carry: a C0 control,
 * DEL, a replacement character produced by a broken escape, or a line break.
 */
function hasForbiddenCharacter(value) {
    for (const character of value) {
        const code = character.codePointAt(0);
        if (code <= 0x1F || code === 0x7F || code === REPLACEMENT_CHARACTER_CODE) return true;
    }
    return false;
}

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/**
 * Whether an integration is usable at all. Both the scheme and the visible name
 * are required: a link without a registered scheme opens nothing, and a button
 * with no name cannot be labelled honestly.
 */
export function isOpenInIdeConfigured(config) {
    const scheme = typeof config?.scheme === 'string' ? config.scheme.trim() : '';
    const appName = typeof config?.appName === 'string' ? config.appName.trim() : '';
    return Boolean(scheme && appName);
}

function validateScheme(scheme) {
    if (typeof scheme !== 'string' || !scheme.trim()) return { error: OPEN_IN_IDE_ERROR_CODES.SCHEME_REQUIRED };
    const value = scheme.trim();
    if (!SCHEME_PATTERN.test(value)) return { error: OPEN_IN_IDE_ERROR_CODES.SCHEME_INVALID };
    return { scheme: value };
}

/**
 * Reads a path parameter. The checks are the ones the contract states: a real
 * filesystem path, never a URL and never a UNC share.
 */
function readPath(value) {
    const text = String(value).trim();
    if (!text) return { error: OPEN_IN_IDE_ERROR_CODES.PATH_EMPTY };
    if (hasForbiddenCharacter(text)) return { error: OPEN_IN_IDE_ERROR_CODES.PATH_INVALID };
    if (text.startsWith('\\\\') || text.startsWith('//')) return { error: OPEN_IN_IDE_ERROR_CODES.PATH_INVALID };
    if (URL_LIKE_PREFIX.test(text)) return { error: OPEN_IN_IDE_ERROR_CODES.PATH_INVALID };
    const segments = text.split(/[\\/]/).filter(Boolean);
    if (segments.some((segment) => segment.toLowerCase() === 'fakepath')) return { error: OPEN_IN_IDE_ERROR_CODES.PATH_INVALID };
    return { path: text, segments };
}

function isAbsolutePath(path) {
    return WINDOWS_ABSOLUTE.test(path) || POSIX_ABSOLUTE.test(path);
}

function readPosition(value, parameter) {
    if (value === undefined || value === null || value === '') return { absent: true };
    const text = String(value).trim();
    if (!DIGITS_ONLY.test(text)) return { error: OPEN_IN_IDE_ERROR_CODES.POSITION_INVALID, parameter };
    const parsed = Number(text);
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > OPEN_IN_IDE_POSITION_MAX) {
        return { error: OPEN_IN_IDE_ERROR_CODES.POSITION_OUT_OF_RANGE, parameter };
    }
    return { value: parsed };
}

/**
 * Turns entries into a validated parameter set. Entries can arrive as an object
 * (the common case, where duplicates are impossible) or as pairs, which is how a
 * duplicate or an unknown key can actually reach this function.
 */
function readEntries(entries) {
    const seen = new Set();
    const values = Object.create(null);
    for (const entry of entries) {
        const [rawKey, rawValue] = entry;
        const key = String(rawKey);
        if (!OPEN_IN_IDE_PARAMETERS.includes(key)) return { error: OPEN_IN_IDE_ERROR_CODES.UNKNOWN_PARAMETER, parameter: key };
        if (seen.has(key)) return { error: OPEN_IN_IDE_ERROR_CODES.DUPLICATE_PARAMETER, parameter: key };
        seen.add(key);
        if (rawValue === undefined || rawValue === null) continue;
        const value = typeof rawValue === 'string' ? rawValue : String(rawValue);
        if (hasForbiddenCharacter(value)) return { error: OPEN_IN_IDE_ERROR_CODES.INVALID_ENCODING, parameter: key };
        if (value === '') continue;
        values[key] = value;
    }
    return { values };
}

/** Applies the contract rules to an already-decoded parameter set. */
function validateValues(values) {
    const params = { version: OPEN_IN_IDE_CONTRACT_VERSION };

    if (values.v !== undefined && values.v !== OPEN_IN_IDE_CONTRACT_VERSION) {
        return { error: OPEN_IN_IDE_ERROR_CODES.INVALID_VERSION };
    }

    if (values.project !== undefined) {
        const project = readPath(values.project);
        if (project.error) return { error: project.error, parameter: 'project' };
        if (!isAbsolutePath(project.path)) return { error: OPEN_IN_IDE_ERROR_CODES.PATH_NOT_ABSOLUTE, parameter: 'project' };
        params.project = project.path;
    }

    if (values.file !== undefined) {
        const file = readPath(values.file);
        if (file.error) return { error: file.error, parameter: 'file' };
        // A relative file has to stay inside the project it names.
        if (!isAbsolutePath(file.path) && file.segments.includes('..')) {
            return { error: OPEN_IN_IDE_ERROR_CODES.PATH_OUTSIDE_PROJECT, parameter: 'file' };
        }
        params.file = file.path;
    }

    const line = readPosition(values.line, 'line');
    const column = readPosition(values.column, 'column');
    if (line.error) return { error: line.error, parameter: 'line' };
    if (column.error) return { error: column.error, parameter: 'column' };
    // A position without a file has nothing to point at.
    if ((line.value !== undefined || column.value !== undefined) && params.file === undefined) {
        return { error: OPEN_IN_IDE_ERROR_CODES.POSITION_REQUIRES_FILE, parameter: line.value !== undefined ? 'line' : 'column' };
    }
    if (line.value !== undefined) params.line = line.value;
    if (column.value !== undefined) params.column = column.value;

    if (values.panel !== undefined) {
        if (!OPEN_IN_IDE_PANELS.includes(values.panel)) return { error: OPEN_IN_IDE_ERROR_CODES.PANEL_UNKNOWN, parameter: 'panel' };
        params.panel = values.panel;
    }

    return { params };
}

function serialize(scheme, params) {
    const search = new URLSearchParams();
    search.set('v', params.version);
    if (params.project !== undefined) search.set('project', params.project);
    if (params.file !== undefined) search.set('file', params.file);
    if (params.line !== undefined) search.set('line', String(params.line));
    if (params.column !== undefined) search.set('column', String(params.column));
    if (params.panel !== undefined) search.set('panel', params.panel);
    const url = `${scheme}://${OPEN_IN_IDE_ACTION}?${search.toString()}`;
    if (url.length > OPEN_IN_IDE_MAX_URL_LENGTH) return { error: OPEN_IN_IDE_ERROR_CODES.URL_TOO_LONG };
    return { url };
}

/**
 * Collects the caller's parameters.
 *
 * `params` accepts an object or an array of pairs. The array form exists so an
 * unknown key or a repeated key can reach the builder and be reported, instead
 * of being silently collapsed by the object form.
 */
function collectEntries(input) {
    if (input.params !== undefined) {
        const source = input.params;
        if (Array.isArray(source)) return source.map((entry) => (Array.isArray(entry) ? entry : [entry, undefined]));
        if (isPlainObject(source)) return Object.entries(source);
        return [];
    }
    const entries = Object.entries(input).filter(([key]) => key !== 'scheme');
    // An explicit action is only accepted when it is the one the contract has.
    const action = entries.find(([key]) => key === 'action');
    if (action && action[1] !== OPEN_IN_IDE_ACTION) return [['action', action[1]]];
    return entries.filter(([key]) => key !== 'action');
}

/**
 * Builds a link. Returns `{ url }` or `{ error, parameter? }`.
 *
 * ```js
 * buildOpenInIdeUrl({ scheme: 'myeditor', project: 'C:\\Docs', file: 'notes/a b.md', line: 3 })
 * ```
 *
 * Anything absent is omitted. Every value is encoded, and the result is parsed
 * back before it leaves this function.
 */
export function buildOpenInIdeUrl(input = {}) {
    if (!isPlainObject(input)) return { error: OPEN_IN_IDE_ERROR_CODES.INVALID_URL };

    const scheme = validateScheme(input.scheme);
    if (scheme.error) return { error: scheme.error };

    const entries = collectEntries(input);
    const unsupportedAction = entries.find(([key]) => String(key) === 'action');
    if (unsupportedAction) return { error: OPEN_IN_IDE_ERROR_CODES.UNSUPPORTED_ACTION };

    const read = readEntries(entries);
    if (read.error) return { error: read.error, parameter: read.parameter };

    const validated = validateValues(read.values);
    if (validated.error) return { error: validated.error, parameter: validated.parameter };

    const built = serialize(scheme.scheme, validated.params);
    if (built.error) return { error: built.error };

    const verified = parseOpenInIdeUrl(built.url);
    if (verified.error) return { error: verified.error, parameter: verified.parameter };
    return { url: built.url, params: verified.params };
}

/**
 * Parses and validates a link, which is also how this module verifies its own
 * output. Returns `{ url, params }` or `{ error, parameter? }`.
 */
export function parseOpenInIdeUrl(url) {
    if (typeof url !== 'string' || !url.trim()) return { error: OPEN_IN_IDE_ERROR_CODES.INVALID_URL };
    const text = url.trim();

    const separator = text.indexOf('://');
    if (separator <= 0) return { error: OPEN_IN_IDE_ERROR_CODES.INVALID_URL };
    const scheme = validateScheme(text.slice(0, separator));
    if (scheme.error) return { error: scheme.error };

    const rest = text.slice(separator + 3);
    const queryIndex = rest.indexOf('?');
    const action = (queryIndex === -1 ? rest : rest.slice(0, queryIndex)).replace(/\/+$/, '');
    if (action !== OPEN_IN_IDE_ACTION) return { error: OPEN_IN_IDE_ERROR_CODES.UNSUPPORTED_ACTION };
    if (text.length > OPEN_IN_IDE_MAX_URL_LENGTH) return { error: OPEN_IN_IDE_ERROR_CODES.URL_TOO_LONG };
    if (queryIndex === -1) return { url: text, params: { version: OPEN_IN_IDE_CONTRACT_VERSION } };

    const query = rest.slice(queryIndex + 1);
    const entries = [...new URLSearchParams(query).entries()];
    for (const [, value] of entries) {
        if (String(value).includes('\uFFFD')) return { error: OPEN_IN_IDE_ERROR_CODES.INVALID_ENCODING };
    }
    try {
        decodeURIComponent(query);
    } catch {
        return { error: OPEN_IN_IDE_ERROR_CODES.INVALID_ENCODING };
    }

    const read = readEntries(entries);
    if (read.error) return { error: read.error, parameter: read.parameter };

    const validated = validateValues(read.values);
    if (validated.error) return { error: validated.error, parameter: validated.parameter };

    return { url: text, params: validated.params };
}