/**
 * useWorkspacePreferences — persisted editor preferences.
 *
 * Agentic mode, image generation config and the creative task mode are stored in
 * localStorage, so they survive reloads. They live together because the
 * generation flow reads all three when it assembles a prompt.
 */

import { useCallback, useState } from 'react';
import { STORAGE_KEYS } from '../../../config/constants';
import { getAgenticMode } from '../components/agenticModeStorage';
import { getDefaultImageConfig } from '../components/imageConfigSchema';

const readStored = (key, fallback) => localStorage.getItem(key) || fallback;

export function useWorkspacePreferences() {
    const [agenticMode, setAgenticMode] = useState(() => getAgenticMode());
    const [imageConfig, setImageConfig] = useState(() => getDefaultImageConfig());
    const [imageProcessingMode] = useState(() => readStored(STORAGE_KEYS.IMAGE_PROCESSING_MODE, 'smart'));
    const [creativeTaskMode, setCreativeTaskModeState] = useState(
        () => readStored(STORAGE_KEYS.CREATIVE_TASK_MODE, 'edit_template')
    );
    const [showLastPromptInResult] = useState(
        () => localStorage.getItem(STORAGE_KEYS.SHOW_LAST_PROMPT) === 'true'
    );

    const setCreativeTaskMode = useCallback((mode) => {
        setCreativeTaskModeState(mode);
        localStorage.setItem(STORAGE_KEYS.CREATIVE_TASK_MODE, mode);
    }, []);

    return {
        agenticMode,
        setAgenticMode,
        imageConfig,
        setImageConfig,
        imageProcessingMode,
        creativeTaskMode,
        setCreativeTaskMode,
        showLastPromptInResult
    };
}