import { beforeEach, describe, expect, it } from 'vitest';
import { STORAGE_KEYS } from '../../config/constants';
import { addModel, removeModel, PROVIDERS } from '../models';
import {
    getActiveImageModel,
    getActiveTextModel,
    getActiveVisionModel,
    getImageModelOptions,
    getTextModelOptions,
    getVisionModelOptions,
    setActiveModels
} from './index';

describe('explicit model selection', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('starts with only the unselected placeholder and no vendor model', () => {
        const text = getTextModelOptions();
        const image = getImageModelOptions();
        const vision = getVisionModelOptions();

        expect(text).toHaveLength(1);
        expect(image).toHaveLength(1);
        expect(vision).toHaveLength(1);
        expect(text[0]).toMatchObject({ id: '', isPlaceholder: true, provider: null });
        expect(image[0]).toMatchObject({ id: '', isPlaceholder: true, provider: null });
        expect(vision[0]).toMatchObject({ id: '', isPlaceholder: true, provider: null });
    });

    it('clears stale saved IDs instead of resolving or selecting another model', () => {
        localStorage.setItem(STORAGE_KEYS.SELECTED_TEXT_MODEL, 'vendor/hardcoded-old-id');

        expect(getActiveTextModel()).toBeNull();
        expect(localStorage.getItem(STORAGE_KEYS.SELECTED_TEXT_MODEL)).toBeNull();
    });

    it('keeps text, image and vision selections independent', () => {
        addModel({ id: 'text-user-model', provider: PROVIDERS.OPENAI, capabilities: { text: true } });
        addModel({ id: 'image-user-model', provider: PROVIDERS.OPENAI, capabilities: { imageGeneration: true } });
        addModel({ id: 'vision-user-model', provider: PROVIDERS.OPENAI, capabilities: { vision: true } });

        setActiveModels('text-user-model', undefined, undefined);
        expect(getActiveTextModel()).toBe('text-user-model');
        expect(getActiveImageModel()).toBeNull();
        expect(getActiveVisionModel()).toBeNull();

        setActiveModels(undefined, 'image-user-model', undefined);
        expect(getActiveTextModel()).toBe('text-user-model');
        expect(getActiveImageModel()).toBe('image-user-model');
        expect(getActiveVisionModel()).toBeNull();

        setActiveModels(undefined, undefined, 'vision-user-model');
        expect(getActiveTextModel()).toBe('text-user-model');
        expect(getActiveImageModel()).toBe('image-user-model');
        expect(getActiveVisionModel()).toBe('vision-user-model');
    });

    it('leaves a capability unselected when its active model is removed', () => {
        addModel({ id: 'temporary-text-model', provider: PROVIDERS.OPENROUTER, capabilities: { text: true } });
        setActiveModels('temporary-text-model', undefined, undefined);
        expect(getActiveTextModel()).toBe('temporary-text-model');

        removeModel('temporary-text-model');

        expect(getActiveTextModel()).toBeNull();
        expect(localStorage.getItem(STORAGE_KEYS.SELECTED_TEXT_MODEL)).toBeNull();
    });
});
