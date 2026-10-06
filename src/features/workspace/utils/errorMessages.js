/**
 * AI error normalization for the workspace.
 *
 * The AI services signal problems with stable error codes. The workspace turns
 * those codes into translated copy; it never builds its own error sentences.
 */

const ERROR_CODE_KEYS = Object.freeze({
    API_KEY_NOT_CONFIGURED: 'errors.apiKeyNotConfigured',
    REQUEST_TIMEOUT: 'errors.requestTimeout',
    REQUEST_ABORTED: 'errors.requestAborted',
    EMPTY_AI_RESPONSE: 'errors.emptyAIResponse',
    AI_REQUEST_FAILED: 'errors.aiRequestFailed',
    TEXT_MODEL_NOT_SELECTED: 'errors.textModelNotSelected',
    TEXT_MODEL_NOT_SUPPORTED: 'errors.textModelNotSupported',
    IMAGE_MODEL_NOT_SELECTED: 'errors.imageModelNotSelected',
    VISION_MODEL_NOT_SELECTED: 'errors.visionModelNotSelected',
    VISION_MODEL_NOT_SUPPORTED: 'errors.visionModelNotSupported',
    IMAGE_TASK_LIMIT_REACHED: 'errors.imageTaskLimit',
    IMAGE_GENERATION_FAILED: 'errors.imageGenerationFailed',
    IMAGE_ANALYSIS_FAILED: 'errors.imageGenerationFailed',
    IMAGE_GENERATION_NOT_SUPPORTED: 'errors.imageGenerationNotSupported',
    NO_IMAGE_IN_RESPONSE: 'errors.noImageInResponse'
});

const CONTAINS_KEYS = Object.freeze([
    ['API_KEY', 'errors.apiKeyNotConfigured'],
    ['NO_IMAGE_IN_RESPONSE', 'errors.noImageInResponse']
]);

const isAbortMessage = (message) => {
    const raw = String(message || '').trim();
    return raw === 'REQUEST_ABORTED' || raw.includes('ABORT_ERR');
};

/**
 * A cancelled request travels as `throw new Error('REQUEST_ABORTED')` or as a
 * DOM abort error, never as a step status. Callers use this to tell a
 * cancellation apart from a real failure.
 */
export const isAbortError = (error) => {
    if (!error) return false;
    if (error.name === 'AbortError') return true;
    return isAbortMessage(error.message || error);
};

export const normalizeAIError = (message, t) => {
    const rawMessage = String(message || '').trim();
    if (!rawMessage) return t('errors.generic');

    const exactKey = ERROR_CODE_KEYS[rawMessage];
    if (exactKey) return t(exactKey);

    const partial = CONTAINS_KEYS.find(([needle]) => rawMessage.includes(needle));
    if (partial) return t(partial[1]);

    if (rawMessage.includes('PROVIDER_HTTP_429') || rawMessage.includes('429')) {
        return `${t('errors.rateLimit')}\n\n${rawMessage}`;
    }

    return rawMessage;
};
