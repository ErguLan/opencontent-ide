/**
 * useWorkspaceProjects — Project CRUD & version management
 * OpenContent IDE
 */
import { useState, useRef, useCallback } from 'react';
import {
    getProjectsLocal,
    getProjectLocal,
    createProjectLocal,
    updateProjectLocal,
    deleteProjectLocal
} from '../../../services/projectsLocal';

export function useWorkspaceProjects(usageUserId) {
    const [projects, setProjects] = useState([]);
    const [projectsLoaded, setProjectsLoaded] = useState(false);
    const [currentProjectId, setCurrentProjectId] = useState(null);
    const [versions, setVersions] = useState([]);
    const [currentVersionIndex, setCurrentVersionIndex] = useState(-1);
    const lastTypedVersionIndex = useRef(-1);

    const loadProjects = useCallback(async () => {
        try {
            const loaded = await getProjectsLocal();
            setProjects(loaded || []);
            setProjectsLoaded(true);
            return loaded || [];
        } catch (err) {
            console.error('Failed to load projects:', err);
            setProjectsLoaded(true);
            return [];
        }
    }, []);

    const loadProjectById = useCallback(async (projectId) => {
        try {
            const project = await getProjectLocal(projectId);
            if (project) {
                setCurrentProjectId(project.id);
                const loadedVersions = Array.isArray(project.versions) && project.versions.length > 0
                    ? project.versions
                    : project.result
                        ? [{ type: project.type || 'text', prompt: project.prompt || '', result: project.result, model: project.model || 'unknown', steps: project.steps || [], isNew: false }]
                        : [];
                setVersions(loadedVersions);
                setCurrentVersionIndex(loadedVersions.length > 0 ? loadedVersions.length - 1 : -1);
                return project;
            }
            return null;
        } catch (err) {
            console.error('Failed to load project:', err);
            return null;
        }
    }, []);

    const createProject = useCallback(async (data) => {
        try {
            const project = await createProjectLocal(data);
            setProjects(prev => [project, ...prev]);
            setCurrentProjectId(project.id);
            return project;
        } catch (err) {
            console.error('Failed to create project:', err);
            return null;
        }
    }, []);

    const updateProject = useCallback(async (projectId, data) => {
        try {
            await updateProjectLocal(projectId, data);
            setProjects(prev => prev.map(p => p.id === projectId ? { ...p, ...data } : p));
        } catch (err) {
            console.error('Failed to update project:', err);
        }
    }, []);

    const deleteProject = useCallback(async (projectId) => {
        try {
            await deleteProjectLocal(projectId);
            setProjects(prev => prev.filter(p => p.id !== projectId));
            if (currentProjectId === projectId) {
                setCurrentProjectId(null);
                setVersions([]);
                setCurrentVersionIndex(-1);
            }
        } catch (err) {
            console.error('Failed to delete project:', err);
        }
    }, [currentProjectId]);

    const addVersion = useCallback((version) => {
        setVersions(prev => {
            const next = [...prev, version];
            setCurrentVersionIndex(next.length - 1);
            return next;
        });
    }, []);

    const getSafeVersionIndex = useCallback((index, list = versions) => {
        if (!list || list.length === 0) return -1;
        if (index < 0) return 0;
        if (index >= list.length) return list.length - 1;
        return index;
    }, [versions]);

    const goToPrevVersion = useCallback(() => {
        setCurrentVersionIndex(prev => getSafeVersionIndex(prev - 1));
    }, [getSafeVersionIndex]);

    const goToNextVersion = useCallback(() => {
        setCurrentVersionIndex(prev => getSafeVersionIndex(prev + 1));
    }, [getSafeVersionIndex]);

    const currentVersion = versions[currentVersionIndex] || null;

    return {
        projects,
        projectsLoaded,
        currentProjectId,
        setCurrentProjectId,
        versions,
        setVersions,
        currentVersionIndex,
        setCurrentVersionIndex,
        lastTypedVersionIndex,
        currentVersion,
        loadProjects,
        loadProjectById,
        createProject,
        updateProject,
        deleteProject,
        addVersion,
        getSafeVersionIndex,
        goToPrevVersion,
        goToNextVersion
    };
}
