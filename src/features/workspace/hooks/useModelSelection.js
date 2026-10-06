/**
 * useModelSelection — explicit, user-owned model selection.
 *
 * OpenContent never chooses a model for the user. When the registry changes,
 * an invalid selection is cleared and its storage key is removed; no other
 * model is ever assigned. The check is based on the placeholder marker of the
 * option list, never on the position of the unselected entry.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { STORAGE_KEYS } from '../../../config/constants';
import {
    getActiveImageModel,
    getActiveTextModel,
    getActiveVisionModel,
    getImageModelOptions,
    getTextModelOptions,
    getVisionModelOptions
} from '../../../services/ai';
import { syncBrowserClientConfig } from '../../../services/externalSessions';
import { trackMetric } from '../../../services/metrics';
import {
    composeSelectableOptions,
    getModelBlurb,
    getModelLabel,
    persistSelections,
    resolveSelection
} from '../utils/modelSelection';

/**
 * The registry lives outside React. It is read when the workspace mounts, and
 * models can only be added or removed from the `/setup` surface, which unmounts
 * the workspace. Every list is composed by marker, never by position, so
 * composing it can never activate a model on its own.
 */
const buildRegistry = () => ({
    text: composeSelectableOptions(getTextModelOptions()),
    image: composeSelectableOptions(getImageModelOptions()),
    vision: composeSelectableOptions(getVisionModelOptions())
});

export function useModelSelection({ t }) {
    const [textModel, setTextModelState] = useState(() => getActiveTextModel());
    const [imageModel, setImageModelState] = useState(() => getActiveImageModel());
    const [visionModel, setVisionModelState] = useState(() => getActiveVisionModel());

    const registry = useMemo(() => buildRegistry(), []);

    const textModelOptions = registry.text;
    const imageModelOptions = registry.image;
    const visionModelOptions = registry.vision;

    // Validation only: an invalid selection is cleared, never replaced.
    useEffect(() => {
        const nextText = resolveSelection(textModelOptions, textModel, STORAGE_KEYS.SELECTED_TEXT_MODEL);
        const nextImage = resolveSelection(imageModelOptions, imageModel, STORAGE_KEYS.SELECTED_IMAGE_MODEL);
        const nextVision = resolveSelection(visionModelOptions, visionModel, STORAGE_KEYS.SELECTED_VISION_MODEL);

        if (nextText !== (textModel || null)) setTextModelState(nextText);
        if (nextImage !== (imageModel || null)) setImageModelState(nextImage);
        if (nextVision !== (visionModel || null)) setVisionModelState(nextVision);
    }, [textModelOptions, imageModelOptions, visionModelOptions, textModel, imageModel, visionModel]);

    useEffect(() => {
        syncBrowserClientConfig({
            activeTextModel: textModel,
            activeVisionModel: visionModel,
            activeImageModel: imageModel
        });
    }, [textModel, visionModel, imageModel]);

    const setTextModel = useCallback((value) => setTextModelState(value || null), []);
    const setImageModel = useCallback((value) => setImageModelState(value || null), []);
    const setVisionModel = useCallback((value) => setVisionModelState(value || null), []);

    const persistSelection = useCallback(({ trackPlan, isPro }) => {
        persistSelections({ text: textModel, image: imageModel, vision: visionModel });
        trackMetric('model_selection_saved', {
            textModel,
            imageModel,
            visionModel,
            plan: trackPlan || (isPro ? 'PRO' : 'FREE')
        });
    }, [imageModel, textModel, visionModel]);

    const getTextModelLabel = useCallback(
        (modelId = textModel) => getModelLabel(textModelOptions, modelId, t('workspace.model.noModelSelected')),
        [t, textModel, textModelOptions]
    );

    const getTextModelBlurb = useCallback(
        (modelId = textModel) => getModelBlurb(textModelOptions, modelId, t('workspace.model.noModels')),
        [t, textModel, textModelOptions]
    );

    const getImageModelBlurb = useCallback(
        (modelId = imageModel) => getModelBlurb(imageModelOptions, modelId, t('workspace.model.noModels')),
        [imageModel, imageModelOptions, t]
    );

    const getVisionModelBlurb = useCallback(
        (modelId = visionModel) => getModelBlurb(visionModelOptions, modelId, t('workspace.model.noModels')),
        [t, visionModel, visionModelOptions]
    );

    return {
        textModel,
        setTextModel,
        imageModel,
        setImageModel,
        visionModel,
        setVisionModel,
        hasTextModel: Boolean(textModel),
        textModelOptions,
        imageModelOptions,
        visionModelOptions,
        persistSelection,
        getTextModelLabel,
        getTextModelBlurb,
        getImageModelBlurb,
        getVisionModelBlurb
    };
}
