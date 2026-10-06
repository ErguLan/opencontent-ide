/**
 * useWorkspaceEntry — navigation state that arrives from other surfaces.
 *
 * The landing hands over an `initialPrompt`, the library hands over an
 * `attachAssetId`. Both are consumed once and then removed from the URL state so
 * a reload does not replay them. External sessions are mirrored in the
 * background, and the `:id` route is resolved into the workspace.
 */

import { useEffect, useRef } from 'react';
import { isAIConfigured } from '../../../services/ai';
import { syncExternalSessions } from '../../../services/externalSessions';
import { AGENT_STATES } from './useAgentRun';

const SESSION_SYNC_INTERVAL_MS = 5000;

export function useWorkspaceEntry({
    t,
    location,
    navigate,
    routeProjectId,
    agentRun,
    results,
    loadProjects,
    loadMedia,
    loadProjectFromRoute,
projectsLoaded,
    routeReloadToken,
    mediaAssets,
    attachExistingAsset,
    toggleAssetActive,
    onStartGeneration
}) {
    const initialPromptHandled = useRef(false);
    const routeLoadRef = useRef('');
    const { agentState, notifyAIError } = agentRun;

    // The run starts in `not_configured` when no provider key is available.
    useEffect(() => {
        if (agentState !== AGENT_STATES.NOT_CONFIGURED) return;
        notifyAIError('API_KEY_NOT_CONFIGURED', t('errors.apiKeyNotConfiguredTitle'));
    }, [agentState, notifyAIError, t]);

    useEffect(() => {
        loadProjects();
    }, [loadProjects]);

    useEffect(() => {
        loadMedia();
    }, [loadMedia]);

    useEffect(() => {
        const initialPrompt = typeof location.state?.initialPrompt === 'string'
            ? location.state.initialPrompt
            : null;
        if (!initialPrompt || initialPromptHandled.current) return;
        initialPromptHandled.current = true;
        results.setCurrentPrompt(initialPrompt);
        navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
        if (isAIConfigured()) onStartGeneration(initialPrompt);
    }, [
        location.pathname,
        location.search,
        location.state,
        navigate,
        onStartGeneration,
        results,
        t
    ]);

    useEffect(() => {
        const assetId = location.state?.attachAssetId;
        if (!assetId) return;
        const asset = mediaAssets.find((item) => item.id === assetId);
        if (!asset) return;
        attachExistingAsset(asset);
        toggleAssetActive(asset.id);
        navigate(location.pathname, { replace: true, state: null });
    }, [attachExistingAsset, location.pathname, location.state, mediaAssets, navigate, toggleAssetActive]);

    useEffect(() => {
        const timer = window.setInterval(async () => {
            const imported = await syncExternalSessions();
            if (imported > 0) await loadProjects();
        }, SESSION_SYNC_INTERVAL_MS);
        return () => window.clearInterval(timer);
    }, [loadProjects]);

    useEffect(() => {
        if (!routeProjectId || !projectsLoaded) return;
        // The project loader is rebuilt whenever the workspace re-renders, so the
        // guard is keyed on the route itself: one load per project, or per retry.
        const loadKey = `${routeProjectId}:${routeReloadToken}`;
        if (routeLoadRef.current === loadKey) return;
        routeLoadRef.current = loadKey;
        loadProjectFromRoute(routeProjectId);
    }, [loadProjectFromRoute, projectsLoaded, routeProjectId, routeReloadToken]);
}