/**
 * Workspace model selection helpers.
 *
 * The registry is user-owned: OpenContent never injects a vendor model and
 * never auto-selects one. The option services return an explicit unselected
 * placeholder, but the workspace never relies on its position: every check
 * here is based on the `isPlaceholder` marker, so reordering the option list
 * cannot silently activate a model.
 */

import { STORAGE_KEYS } from '../../../config/constants';

/** Model option lists as published by the AI service, placeholder included. */
const isPlaceholderOption = (option) => Boolean(option?.isPlaceholder) || !option?.id;

/** Only real, registered models. The placeholder is never a selectable model. */
const getRegisteredOptions = (options) => (Array.isArray(options) ? options : [])
    .filter((option) => !isPlaceholderOption(option));

/** The unselected entry is identified by its marker, never by its position. */
const findPlaceholderOption = (options) => (Array.isArray(options) ? options : [])
    .find((option) => isPlaceholderOption(option)) || null;

/**
 * Composes the list a selector renders: the unselected entry first, then every
 * registered model. The placeholder is located by its marker, so the invariant
 * "the workspace never activates a model the user did not choose" holds no
 * matter which order the registry service returns.
 */
export const composeSelectableOptions = (options) => {
    const placeholder = findPlaceholderOption(options);
    const fallbackPlaceholder = {
        id: '',
        nickname: '',
        provider: null,
        isPlaceholder: true
    };
    return [placeholder || fallbackPlaceholder, ...getRegisteredOptions(options)];
};

/**
 * True when `modelId` is a registered model of that capability list.
 * An empty/null selection is valid and means "unselected".
 */
const isValidSelection = (options, modelId) => {
    if (!modelId) return true;
    return getRegisteredOptions(options).some((option) => option.id === modelId);
};

/**
 * Resolve a selection against the current registry without ever choosing a
 * model for the user: an invalid selection becomes `null` and its storage key
 * is cleared. Valid selections are returned untouched.
 */
export const resolveSelection = (options, modelId, storageKey) => {
    if (isValidSelection(options, modelId)) return modelId || null;
    if (storageKey) localStorage.removeItem(storageKey);
    return null;
};

const SELECTION_KEYS = Object.freeze({
    text: STORAGE_KEYS.SELECTED_TEXT_MODEL,
    image: STORAGE_KEYS.SELECTED_IMAGE_MODEL,
    vision: STORAGE_KEYS.SELECTED_VISION_MODEL
});

export const persistSelections = ({ text, image, vision }) => {
    if (text !== undefined) persistSelection(SELECTION_KEYS.text, text);
    if (image !== undefined) persistSelection(SELECTION_KEYS.image, image);
    if (vision !== undefined) persistSelection(SELECTION_KEYS.vision, vision);
};

const persistSelection = (storageKey, modelId) => {
    if (modelId) localStorage.setItem(storageKey, modelId);
    else localStorage.removeItem(storageKey);
};

/**
 * Callers reach these helpers both with a selection id and with the option
 * object a selector already has in hand. Accepting either keeps the return
 * value a string: handing an option object back where a label is expected puts
 * a raw object into the DOM.
 */
const toModelId = (selection) => (
    typeof selection === 'string' ? selection : (selection?.id || '')
);

export const getModelLabel = (options, selection, fallbackLabel) => {
    const modelId = toModelId(selection);
    if (!modelId) return fallbackLabel;
    const model = getRegisteredOptions(options).find((option) => option.id === modelId);
    return model?.nickname || modelId;
};

export const getModelBlurb = (options, selection, fallbackLabel) => {
    const modelId = toModelId(selection);
    if (!modelId) return fallbackLabel;
    const model = getRegisteredOptions(options).find((option) => option.id === modelId);
    return model?.provider || fallbackLabel;
};
