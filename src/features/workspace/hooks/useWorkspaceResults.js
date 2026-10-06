/**
 * useWorkspaceResults — version list, history and result presentation.
 *
 * Owns the produced versions, the current version selection, the typewriter
 * reveal of a new text result and the copy action of the result area.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AGENT_STATES } from './useAgentRun';
import { getSafeVersionIndex } from '../utils/promptHelpers';

const TYPEWRITER_INTERVAL_MS = 5;

export function useWorkspaceResults({ agentRun, t }) {
    const [versions, setVersions] = useState([]);
    const [currentVersionIndex, setCurrentVersionIndex] = useState(-1);
    const [history, setHistory] = useState([]);
    const [currentPrompt, setCurrentPrompt] = useState('');
    const lastTypedVersionRef = useRef(-1);

    const { agentState, setDisplayedText } = agentRun;

    const versionsRef = useRef(versions);
    useEffect(() => {
        versionsRef.current = versions;
    }, [versions]);
    const versionsLength = versions.length;

    useEffect(() => {
        if (versionsLength === 0 && currentVersionIndex !== -1) {
            setCurrentVersionIndex(-1);
            return;
        }
        if (versionsLength > 0 && (currentVersionIndex < 0 || currentVersionIndex >= versionsLength)) {
            setCurrentVersionIndex(versionsLength - 1);
        }
    }, [versionsLength, currentVersionIndex]);

    useEffect(() => {
        if (currentVersionIndex < 0) return undefined;
        const currentVersion = versionsRef.current[currentVersionIndex];
        if (agentState !== AGENT_STATES.COMPLETE) {
            setDisplayedText('');
            return undefined;
        }
        if (currentVersion?.type !== 'text') {
            setDisplayedText('');
            return undefined;
        }
        if (currentVersion?.isNew && lastTypedVersionRef.current !== currentVersionIndex) {
            lastTypedVersionRef.current = currentVersionIndex;
            const rawText = currentVersion.result || '';
            let cursor = 0;
            setDisplayedText('');
            const timer = setInterval(() => {
                setDisplayedText(rawText.substring(0, cursor + 1));
                cursor += 1;
                if (cursor >= rawText.length) clearInterval(timer);
            }, TYPEWRITER_INTERVAL_MS);
            return () => clearInterval(timer);
        }
        lastTypedVersionRef.current = currentVersionIndex;
        setDisplayedText(currentVersion.result || '');
        return undefined;
    }, [agentState, currentVersionIndex, versionsLength, setDisplayedText]);

    // Scroll to top when switching versions (not on every text update).
    useEffect(() => {
        const canvas = document.querySelector('.workspace-canvas');
        if (canvas && agentState === AGENT_STATES.COMPLETE) {
            canvas.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }, [currentVersionIndex, agentState]);

    const getCurrentVersion = useCallback(() => {
        const safeIndex = getSafeVersionIndex(currentVersionIndex, versions);
        return safeIndex >= 0 ? versions[safeIndex] : null;
    }, [currentVersionIndex, versions]);

    const goToPrevVersion = useCallback(() => {
        setCurrentVersionIndex((prev) => (prev > 0 ? prev - 1 : prev));
    }, []);

    const goToNextVersion = useCallback(() => {
        setCurrentVersionIndex((prev) => (prev < versions.length - 1 ? prev + 1 : prev));
    }, [versions.length]);

    const currentVersion = getCurrentVersion();
    const currentVersionPromptPreview = (
        currentVersion?.imagePrompt
        || currentVersion?.prompt
        || currentPrompt
        || ''
    ).trim();

    const copyCurrentVersionText = useCallback(async () => {
        const text = currentVersion?.result?.trim() || '';
        if (!text) {
            agentRun.openInfoNotice(t('workspace.noTextToCopyTitle'), t('workspace.noTextToCopyMessage'));
            return;
        }
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            agentRun.setErrorMessage(t('errors.copyFailed'));
        }
    }, [agentRun, currentVersion, t]);

    const resetResults = useCallback(() => {
        setVersions([]);
        setCurrentVersionIndex(-1);
        setHistory([]);
        setCurrentPrompt('');
    }, []);

    return {
        versions,
        setVersions,
        currentVersionIndex,
        setCurrentVersionIndex,
        history,
        setHistory,
        currentPrompt,
        setCurrentPrompt,
        currentVersion,
        currentVersionPromptPreview,
        getSafeIndex: getSafeVersionIndex,
        goToPrevVersion,
        goToNextVersion,
        copyCurrentVersionText,
        resetResults
    };
}
