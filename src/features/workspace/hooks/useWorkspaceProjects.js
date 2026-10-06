/**
 * useWorkspaceProjects - local project list and route resolution.
 *
 * Projects live in IndexedDB and are mirrored from the optional external
 * session server. Only the newest read is allowed to publish, so a slow
 * request can never overwrite a newer one.
 */

import { useCallback, useRef, useState } from 'react';
import { ROUTES, STORAGE_KEYS } from '../../../config/constants';
import { deleteLocalProject, getLocalProject, getLocalProjects } from '../../../services/projectsLocal';
import { syncExternalSessions } from '../../../services/externalSessions';
import { trackMetric } from '../../../services/metrics';
import { AGENT_STATES } from './useAgentRun';
import { AGENTIC_STEP_STATUS } from '../../../services/ai/agenticPipeline';
import { toMillis } from '../utils/promptHelpers';

export const PROJECT_LOAD_STATES = Object.freeze({
    IDLE: 'idle',
    LOADING: 'loading',
    READY: 'ready',
    ERROR: 'error'
});

/** Lifecycle of a stored project. Independent from the agentic step vocabulary. */
export const PROJECT_STATUS = Object.freeze({
    IDLE: 'idle',
    DRAFT: 'draft',
    GENERATING: 'generating',
    COMPLETE: 'complete',
    ERROR: 'error'
});

export function useWorkspaceProjects({ t, agentRun, results, isGenerating, currentProjectId, onProjectIdChange, onProjectStatusChange }) {
    const [projects, setProjects] = useState([]);
    const [projectsLoaded, setProjectsLoaded] = useState(false);
    const [projectLoadState, setProjectLoadState] = useState(PROJECT_LOAD_STATES.IDLE);
    const [projectLoadError, setProjectLoadError] = useState('');
    const [projectLoadAttempt, setProjectLoadAttempt] = useState(0);

    const projectsLoadRequestRef = useRef(0);
    const projectRouteRequestRef = useRef(0);

    const loadProjects = useCallback(async () => {
        const requestId = projectsLoadRequestRef.current + 1;
        projectsLoadRequestRef.current = requestId;
        try {
            await syncExternalSessions();
            const localItems = (await getLocalProjects()).map((item) => ({
                ...item,
                cloudSynced: Boolean(item.cloudSynced)
            }));
            if (requestId !== projectsLoadRequestRef.current) return localItems;
            localItems.sort((a, b) => toMillis(b.updatedAt || b.createdAt) - toMillis(a.updatedAt || a.createdAt));
            setProjects(localItems);
            return localItems;
        } catch (error) {
            console.error('Failed to load local projects', error);
            if (requestId === projectsLoadRequestRef.current) {
                setProjectLoadState(PROJECT_LOAD_STATES.ERROR);
                setProjectLoadError(error?.message || t('workspace.projectLoadErrorMessage'));
            }
            return [];
        } finally {
            if (requestId === projectsLoadRequestRef.current) setProjectsLoaded(true);
        }
    }, [t]);

    const openProject = useCallback((project, source = 'manual') => {
        if (!project?.id) return;

        onProjectIdChange(project.id);
        results.setCurrentPrompt(project.prompt || project.name || '');

        const loadedVersions = Array.isArray(project.versions) && project.versions.length > 0
            ? project.versions.map((version) => ({ ...version, isNew: false }))
            : (project.result ? [{
                type: 'text',
                prompt: project.prompt,
                result: project.result,
                imageUrl: project.imageUrl,
                timestamp: project.updatedAt || project.createdAt,
                isNew: false,
                steps: [{
                    id: 1,
                    text: t('workspace.loadedFromHistory'),
                    status: AGENTIC_STEP_STATUS.COMPLETED
                }]
            }] : []);

        if (loadedVersions.length > 0) {
            const safeIndex = Math.min(
                Math.max(project.currentVersionIndex || 0, 0),
                loadedVersions.length - 1
            );
            results.setVersions(loadedVersions);
            results.setCurrentVersionIndex(safeIndex);
            results.setHistory(project.history || []);
            agentRun.setAgentState(AGENT_STATES.COMPLETE);
            onProjectStatusChange(PROJECT_STATUS.COMPLETE);
        } else {
            results.setVersions([]);
            results.setCurrentVersionIndex(-1);
            results.setHistory(project.history || []);
            onProjectStatusChange(project.status || PROJECT_STATUS.DRAFT);
            agentRun.setAgentState(project.status === PROJECT_STATUS.ERROR ? AGENT_STATES.ERROR : AGENT_STATES.IDLE);
            agentRun.setErrorMessage(project.errorMessage || '');
            if (project.prompt) {
                agentRun.trackRequest({
                    prompt: project.prompt,
                    isIteration: false,
                    projectId: project.id
                });
            }
        }

        agentRun.setErrorMessage('');
        trackMetric('project_opened', { projectId: project.id, source });
    }, [agentRun, onProjectIdChange, onProjectStatusChange, results, t]);

    const selectProject = useCallback((project, navigate) => {
        if (!project?.id || project.id === currentProjectId) return;
        if (isGenerating) {
            agentRun.openInfoNotice(
                t('workspace.projectSwitchBlockedTitle'),
                t('workspace.projectSwitchBlockedMessage')
            );
            return;
        }
        navigate(ROUTES.PROJECT.replace(':id', project.id));
    }, [agentRun, currentProjectId, isGenerating, t]);

    const removeProject = useCallback(async (projectId) => {
        const deletingCurrentProject = projectId === currentProjectId;
        if (deletingCurrentProject) {
            if (isGenerating) agentRun.cancelRun(t('errors.requestAborted'));
            onProjectIdChange(null);
            onProjectStatusChange(PROJECT_STATUS.IDLE);
            results.resetResults();
            results.setCurrentPrompt('');
            agentRun.setHasRetryRequest(false);
        }
        await deleteLocalProject(projectId);
        await loadProjects();
        trackMetric('project_deleted', { projectId });
    }, [agentRun, currentProjectId, isGenerating, loadProjects, onProjectIdChange, onProjectStatusChange, results, t]);

    const loadProjectFromRoute = useCallback(async (routeProjectId) => {
        const requestId = projectRouteRequestRef.current + 1;
        projectRouteRequestRef.current = requestId;
        setProjectLoadState(PROJECT_LOAD_STATES.LOADING);
        setProjectLoadError('');

        try {
            const localProject = await getLocalProject(routeProjectId);
            if (requestId !== projectRouteRequestRef.current) return;
            if (!localProject) {
                setProjectLoadState(PROJECT_LOAD_STATES.ERROR);
                setProjectLoadError(t('workspace.projectNotFoundMessage'));
                return;
            }
            openProject(localProject, 'url');
            localStorage.setItem(STORAGE_KEYS.LAST_PROJECT, localProject.id);
            setProjectLoadState(PROJECT_LOAD_STATES.READY);
        } catch (error) {
            if (requestId !== projectRouteRequestRef.current) return;
            console.error('Failed to open local project', error);
            setProjectLoadState(PROJECT_LOAD_STATES.ERROR);
            setProjectLoadError(error?.message || t('workspace.projectLoadErrorMessage'));
        }
    }, [openProject, t]);

    const retryProjectLoad = useCallback(() => {
        setProjectLoadError('');
        setProjectLoadState(PROJECT_LOAD_STATES.LOADING);
        setProjectsLoaded(false);
        setProjectLoadAttempt((attempt) => attempt + 1);
        loadProjects();
    }, [loadProjects]);

    return {
        PROJECT_LOAD_STATES,
        PROJECT_STATUS,
        projects,
        projectsLoaded,
        projectLoadState,
        projectLoadError,
        projectLoadAttempt,
        loadProjects,
        loadProjectFromRoute,
        openProject,
        selectProject,
        removeProject,
        retryProjectLoad
    };
}
