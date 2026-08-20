/**
 * Shared provider utilities
 * OpenContent IDE
 */

export const isProbablyHttpUrl = (value) => {
    try {
        const parsed = new URL(value);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
};

export const isProbablyBase64 = (value) => {
    return typeof value === 'string' && value.length > 200 && /^[A-Za-z0-9+/=]+$/.test(value);
};

export const toDataUrl = (raw, mime = 'image/png') => {
    if (!raw || typeof raw !== 'string') return null;
    if (raw.startsWith('data:image')) return raw;
    if (!isProbablyBase64(raw)) return null;
    return `data:${mime};base64,${raw}`;
};

const getNestedProviderMessage = (payload) => {
    const providerError = payload?.error;
    if (typeof providerError === 'string') return providerError;
    return providerError?.message
        || payload?.message
        || payload?.detail
        || payload?.error_description
        || null;
};

export const getErrorMessageFromResponse = async (response) => {
    let payload = null;
    try {
        payload = await response.json();
    } catch {
        // Some gateways return an empty or non-JSON body for failures.
    }

    const providerError = payload?.error;
    const message = getNestedProviderMessage(payload) || response.statusText || 'Provider returned an error';
    const code = typeof providerError === 'object'
        ? providerError?.code || providerError?.type || providerError?.status
        : payload?.code || payload?.type;
    const metadataRaw = typeof providerError === 'object' ? providerError?.metadata?.raw : null;
    const details = [
        code ? `code: ${code}` : '',
        typeof metadataRaw === 'string' ? metadataRaw : ''
    ].filter(Boolean).join(' | ');

    return [
        `PROVIDER_HTTP_${response.status}`,
        message,
        details
    ].filter(Boolean).join(': ');
};

export const normalizeError = (error) => {
    if (error?.name === 'AbortError') return 'REQUEST_ABORTED';
    if (error?.message === 'REQUEST_TIMEOUT') return 'REQUEST_TIMEOUT';
    if (error?.message === 'REQUEST_ABORTED') return 'REQUEST_ABORTED';
    if (error?.code === 'ECONNABORTED') return 'REQUEST_TIMEOUT';
    return error?.message || error?.code || 'AI_REQUEST_FAILED';
};

export function extractImageUrlFromContent(content) {
    if (typeof content === 'string') {
        const match = content.match(/https?:\/\/[^\s"')]+/i);
        if (match && isProbablyHttpUrl(match[0])) return match[0];
        const dataUrl = toDataUrl(content);
        if (dataUrl) return dataUrl;
    }
    return null;
}

export function extractImageFromOpenRouterData(data) {
    if (!data?.choices?.[0]?.message) return null;
    const message = data.choices[0].message;
    const images = message.images;
    if (Array.isArray(images) && images.length > 0) {
        const first = images[0] || {};
        if (isProbablyHttpUrl(first?.image_url?.url)) return first.image_url.url;
        if (isProbablyHttpUrl(first?.url)) return first.url;
        const dataUrl = toDataUrl(first?.b64_json || first?.base64 || first?.data, first?.mime_type);
        if (dataUrl) return dataUrl;
    }
    const content = message.content;
    const fromContent = extractImageUrlFromContent(content);
    if (fromContent) return fromContent;
    if (Array.isArray(content)) {
        for (const part of content) {
            if (isProbablyHttpUrl(part?.image_url?.url)) return part.image_url.url;
            if (isProbablyHttpUrl(part?.url)) return part.url;
            const dataUrl = toDataUrl(
                part?.b64_json || part?.image_base64 || part?.base64 || part?.data || part?.inline_data?.data,
                part?.mime_type || part?.inline_data?.mime_type
            );
            if (dataUrl) return dataUrl;
            if (typeof part?.text === 'string') {
                const matched = part.text.match(/https?:\/\/[^\s"')]+/i)?.[0];
                if (matched && isProbablyHttpUrl(matched)) return matched;
            }
        }
    }
    let found = null;
    const scan = (node) => {
        if (found || node == null) return;
        if (typeof node === 'string') {
            if (isProbablyHttpUrl(node)) {
                found = node;
                return;
            }
            const dataUrl = toDataUrl(node);
            if (dataUrl) found = dataUrl;
            return;
        }
        if (Array.isArray(node)) {
            node.forEach(scan);
            return;
        }
        if (typeof node === 'object') Object.values(node).forEach(scan);
    };
    scan(message);
    return found;
}
