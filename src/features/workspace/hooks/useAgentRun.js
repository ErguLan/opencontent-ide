/**
 * useAgentRun — execution state for the workspace agent.
 *
 * Owns the agent lifecycle (idle/analyzing/generating/complete/error),
 * the step log, the batch progress, the pending artifact approvals and the
 * notice modal. Step statuses always come from the agentic pipeline
 * constants, and a finished run never leaves a step in `working`.
 */

import { useCallback, useRef, useState } from 'react';
import { isAIConfigured } from '../../../services/ai';
import {
    AGENTIC_STEP_STATUS,
    createStep,
    failWorkingSteps,
    resolveSteps,
    skipWorkingSteps
} from '../utils/agentSteps';
import { normalizeAIError } from '../utils/errorMessages';

export const AGENT_STATES = Object.freeze({
    IDLE: 'idle',
    ANALYZING: 'analyzing',
    GENERATING: 'generating',
    COMPLETE: 'complete',
    ERROR: 'error',
    NOT_CONFIGURED: 'not_configured',
    IMAGE_MODEL_MISSING: 'image_model_missing'
});

/** Progress of a batch run. Independent from the step status vocabulary. */
export const BATCH_RUN_STATUS = Object.freeze({
    WORKING: 'working',
    COMPLETE: 'complete',
    CANCELLED: 'cancelled',
    ERROR: 'error'
});

const CLOSED_NOTICE = Object.freeze({ open: false, title: '', message: '', canRetry: false });

export function useAgentRun({ t }) {
    const [agentState, setAgentState] = useState(
        () => (isAIConfigured() ? AGENT_STATES.IDLE : AGENT_STATES.NOT_CONFIGURED)
    );
    const [errorMessage, setErrorMessage] = useState('');
    const [agentSteps, setAgentSteps] = useState([]);
    const [batchProgress, setBatchProgress] = useState(null);
    const [pendingArtifactSaves, setPendingArtifactSaves] = useState([]);
    const [displayedText, setDisplayedText] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [isIterating, setIsIterating] = useState(false);
    const [hasRetryRequest, setHasRetryRequest] = useState(false);
    const [infoModal, setInfoModal] = useState(CLOSED_NOTICE);

    const abortControllerRef = useRef(null);
    const slowNoticeTimerRef = useRef(null);
    const lastRequestRef = useRef(null);

    const isWorking = agentState === AGENT_STATES.ANALYZING
        || agentState === AGENT_STATES.GENERATING;

    const closeInfoModal = useCallback(() => setInfoModal(CLOSED_NOTICE), []);

    const openInfoNotice = useCallback((title, message) => {
        setInfoModal({ open: true, title, message, canRetry: false });
    }, []);

    const notifyAIError = useCallback((rawMessage, title = t('errors.providerErrorTitle')) => {
        const normalized = normalizeAIError(rawMessage, t);
        setErrorMessage(normalized);
        setInfoModal({
            open: true,
            title,
            message: normalized,
            canRetry: Boolean(lastRequestRef.current?.prompt)
        });
        return normalized;
    }, [t]);

    const clearSlowNoticeTimer = useCallback(() => {
        if (slowNoticeTimerRef.current) {
            clearTimeout(slowNoticeTimerRef.current);
            slowNoticeTimerRef.current = null;
        }
    }, []);

    /**
     * The run owns its AbortController. Consumers ask for one here instead of
     * writing the ref themselves, and read the signal through `getRunSignal`.
     */
    const createRunController = useCallback(() => {
        const controller = new AbortController();
        abortControllerRef.current = controller;
        return controller;
    }, []);

    const getRunSignal = useCallback(() => abortControllerRef.current?.signal, []);

    const releaseRunController = useCallback(() => {
        abortControllerRef.current = null;
    }, []);

    const armSlowNoticeTimer = useCallback((controller) => {
        clearSlowNoticeTimer();
        slowNoticeTimerRef.current = setTimeout(() => {
            if (abortControllerRef.current === controller) {
                openInfoNotice(t('errors.slowGenerationTitle'), t('errors.slowGenerationMessage'));
            }
        }, 18000);
    }, [clearSlowNoticeTimer, openInfoNotice, t]);

    const publishSteps = useCallback((next) => {
        setAgentSteps((current) => resolveSteps(current, next));
    }, []);

    const setSteps = useCallback((updater) => {
        setAgentSteps(updater);
    }, []);

    /** A cancelled run is a cancellation, never a failure. */
    const markRunCancelled = useCallback(() => {
        setAgentSteps((steps) => skipWorkingSteps(steps));
    }, []);

    const markRunFailed = useCallback((message) => {
        setAgentSteps((steps) => failWorkingSteps(steps, message));
    }, []);

    const beginRun = useCallback(({ isIteration }) => {
        setIsGenerating(true);
        setIsIterating(isIteration);
        setErrorMessage('');
        setAgentState(AGENT_STATES.ANALYZING);
        setAgentSteps([createStep(1, t('Agent.analyzing'), AGENTIC_STEP_STATUS.WORKING)]);
    }, [t]);

    const endRun = useCallback(() => {
        clearSlowNoticeTimer();
        releaseRunController();
        setIsGenerating(false);
        setIsIterating(false);
    }, [clearSlowNoticeTimer, releaseRunController]);

    const cancelRun = useCallback((customMessage = t('errors.requestAborted')) => {
        clearSlowNoticeTimer();
        const controller = abortControllerRef.current;
        if (controller) {
            controller.abort();
            releaseRunController();
        }
        setAgentState(AGENT_STATES.ERROR);
        setErrorMessage(customMessage);
        setBatchProgress((progress) => (progress?.status === BATCH_RUN_STATUS.WORKING
            ? { ...progress, status: BATCH_RUN_STATUS.CANCELLED }
            : progress));
        markRunCancelled();
        setIsGenerating(false);
        setIsIterating(false);
    }, [clearSlowNoticeTimer, markRunCancelled, releaseRunController, t]);

    const trackRequest = useCallback((request) => {
        lastRequestRef.current = request;
        setHasRetryRequest(true);
    }, []);

    const getAgentStatusText = useCallback(() => {
        switch (agentState) {
            case AGENT_STATES.ANALYZING: return t('Agent.analyzing');
            case AGENT_STATES.GENERATING: return t('Agent.generating');
            case AGENT_STATES.COMPLETE: return t('Agent.complete');
            case AGENT_STATES.NOT_CONFIGURED: return t('errors.notConfigured');
            case AGENT_STATES.ERROR: return t('errors.generic');
            default: return '';
        }
    }, [agentState, t]);

    return {
        AGENT_STATES,
        BATCH_RUN_STATUS,
        agentState,
        setAgentState,
        errorMessage,
        setErrorMessage,
        agentSteps,
        setSteps,
        publishSteps,
        batchProgress,
        setBatchProgress,
        pendingArtifactSaves,
        setPendingArtifactSaves,
        displayedText,
        setDisplayedText,
        isGenerating,
        isIterating,
        isWorking,
        hasRetryRequest,
        infoModal,
        openInfoNotice,
        closeInfoModal,
        notifyAIError,
        clearSlowNoticeTimer,
        armSlowNoticeTimer,
        markRunFailed,
        markRunCancelled,
        beginRun,
        endRun,
        cancelRun,
        trackRequest,
        getAgentStatusText,
        createRunController,
        getRunSignal,
        releaseRunController,
        lastRequestRef
    };
}
