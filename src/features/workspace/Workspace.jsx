/**
 * Workspace Page
 * OpenContent IDE
 *
 * Main working area after submitting a prompt.
 *
 * This file only wires things together: state and behavior live in `hooks/`,
 * presentation in `components/`. There is no AI call and no prompt assembly
 * here.
 */

import { useCallback, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import './Workspace.css';
import './WorkspaceUi.css';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { ROUTES, getExternalIdeIntegration } from '../../config/constants';
import { isOpenInIdeConfigured } from '../../services/integration/openInIde';
import { isAIConfigured } from '../../services/ai';
import { AGENT_STATES, useAgentRun } from './hooks';
import { PROJECT_STATUS, useWorkspaceProjects } from './hooks';
import { useModelSelection } from './hooks';
import { useWorkspaceMedia } from './hooks';
import { useWorkspaceResults } from './hooks';
import { useWorkspaceGeneration } from './hooks';
import { useWorkspaceBatch } from './hooks';
import { useWorkspaceActions } from './hooks';
import { useWorkspaceFreemium } from './hooks';
import { useWorkspacePreferences } from './hooks';
import { useWorkspaceEntry } from './hooks';
import {
    BatchButton,
    BatchMode,
    CalendarToggle,
    ChatInput,
    ContentCalendar,
    CopyAsApiModal,
ModelSelectionModal,
    NoticeModal,
    OpenInIdeModal,
    PaywallModal,
    ProModal,
    WorkspaceCanvas,
    WorkspaceHeader,
    WorkspaceSidebar,
    WorkspaceToolbar
} from './components';
import './components/FeatureComponents.css';

function Workspace() {
    const location = useLocation();
    const navigate = useNavigate();
    const { id: routeProjectId } = useParams();
    const { t, language } = useLanguage();
    const { toggleTheme } = useTheme();
    const { isAuthenticated, profile, isPro } = useAuth();

    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [chatInput, setChatInput] = useState('');
    const [currentProjectId, setCurrentProjectId] = useState(null);
    const [projectStatus, setProjectStatus] = useState(PROJECT_STATUS.IDLE);
    const [showBatchModal, setShowBatchModal] = useState(false);
    const [showCalendar, setShowCalendar] = useState(false);
    const [showModelModal, setShowModelModal] = useState(false);
    const [showProModal, setShowProModal] = useState(false);
    const [showCopyAsApi, setShowCopyAsApi] = useState(false);

    const usageUserId = profile?.uid || 'guest';
    const ideIntegration = getExternalIdeIntegration();
    const ideAvailable = isOpenInIdeConfigured(ideIntegration);

    const agentRun = useAgentRun({ t });
    const results = useWorkspaceResults({ agentRun, t });

    const projects = useWorkspaceProjects({
        t,
        agentRun,
        results,
        isGenerating: agentRun.isGenerating,
        currentProjectId,
        onProjectIdChange: setCurrentProjectId,
        onProjectStatusChange: setProjectStatus
    });

    const freemium = useWorkspaceFreemium({
        t,
        isPro,
        usageUserId,
        projectCount: projects.projects.length,
        currentProjectIterations: results.versions.length
    });

    const media = useWorkspaceMedia({
        isPro,
        t,
        onAssetLimitReached: freemium.openPaywall,
        onError: agentRun.setErrorMessage
    });

    const models = useModelSelection({ t });

    const preferences = useWorkspacePreferences();

    const generation = useWorkspaceGeneration({
        t,
        usageUserId,
        agentRun,
        results,
        projects,
        media,
        models,
        imageConfig: preferences.imageConfig,
        agenticMode: preferences.agenticMode,
        imageProcessingMode: preferences.imageProcessingMode,
        creativeTaskMode: preferences.creativeTaskMode,
        currentProjectId,
        onProjectIdChange: setCurrentProjectId,
        onProjectStatusChange: setProjectStatus,
        onUsageChanged: freemium.refreshUsage,
        gateAction: freemium.gateAction
    });

    const batch = useWorkspaceBatch({
        t,
        usageUserId,
        agentRun,
        results,
        projects,
        media,
        models,
        imageConfig: preferences.imageConfig,
        agenticMode: preferences.agenticMode,
        currentProjectId,
        onProjectIdChange: setCurrentProjectId,
        onProjectStatusChange: setProjectStatus,
        gateAction: freemium.gateAction,
        onUsageChanged: freemium.refreshUsage,
        onComplete: () => {
            setShowBatchModal(false);
            setChatInput('');
            freemium.refreshUsage();
        }
    });

const actions = useWorkspaceActions({
        t,
        usageUserId,
        agentRun,
        results,
        projects,
        media,
        models,
        imageConfig: preferences.imageConfig,
        agenticMode: preferences.agenticMode,
        currentProjectId,
        onRefreshUsage: freemium.refreshUsage,
        gateAction: freemium.gateAction
    });

    const handleIteration = useCallback(() => {
        const prompt = chatInput.trim();
        if (!prompt || agentRun.isGenerating) return;
        const isIteration = results.versions.length > 0;
        setChatInput('');
        if (isIteration) results.setCurrentPrompt(results.currentPrompt || prompt);
        generation.startGeneration(prompt, isIteration);
    }, [agentRun.isGenerating, chatInput, generation, results]);

    const handleStop = useCallback(() => {
        agentRun.cancelRun(t('errors.requestAborted'));
    }, [agentRun, t]);

    const handleRetryGeneration = useCallback(() => {
        const lastRequest = agentRun.lastRequestRef.current;
        if (!lastRequest?.prompt || agentRun.isGenerating) return;
        agentRun.closeInfoModal();
        agentRun.setErrorMessage('');
        generation.startGeneration(lastRequest.prompt, Boolean(lastRequest.isIteration));
    }, [agentRun, generation]);

    const handleNewProject = useCallback(() => {
        navigate(ROUTES.LANDING);
    }, [navigate]);

    const handleOpenSetup = useCallback(() => {
        navigate(ROUTES.SETUP);
    }, [navigate]);

    const handleDeleteProject = useCallback(async (projectId) => {
        if (projectId === currentProjectId) {
            if (agentRun.isGenerating) handleStop();
            navigate(ROUTES.WORKSPACE, { replace: true });
        }
        await projects.removeProject(projectId);
    }, [agentRun.isGenerating, currentProjectId, handleStop, navigate, projects]);

    const handleBatchConfirm = useCallback((count) => {
        setShowBatchModal(false);
        const prompt = chatInput.trim();
        setChatInput('');
        results.setCurrentPrompt(results.currentPrompt || prompt);
        batch.startBatch(prompt, count);
    }, [batch, chatInput, results]);

    const handleSaveModels = useCallback(() => {
        models.persistSelection({ isPro });
        setShowModelModal(false);
    }, [isPro, models]);

    useWorkspaceEntry({
        t,
        location,
        navigate,
        routeProjectId,
        agentRun,
        results,
        loadProjects: projects.loadProjects,
        loadMedia: media.loadMedia,
        loadProjectFromRoute: projects.loadProjectFromRoute,
        projectsLoaded: projects.projectsLoaded,
        routeReloadToken: projects.projectLoadAttempt,
        mediaAssets: media.mediaAssets,
        attachExistingAsset: media.attachExistingAsset,
        toggleAssetActive: media.toggleAssetActive,
        onStartGeneration: generation.startGeneration
    });

    const activeAssets = media.mediaAssets
        .filter((asset) => media.activeAssetIds.includes(asset.id))
        .map((asset) => ({ ...asset, roleLabel: media.getAssetRoleLabel(asset.role) }));

    const usageSummary = isAuthenticated && !isPro
        ? [
            `${projects.projects.length}/${freemium.planLimits.MAX_PROJECTS} ${t('workspace.projects')}`,
            `${freemium.dailyUsage.generate || 0}/${freemium.planLimits.DAILY_GENERATIONS} ${t('workspace.generationsToday')}`
        ]
        : null;

    const hasResults = results.versions.length > 0;
    const showComposer = hasResults
        ? agentRun.agentState === AGENT_STATES.COMPLETE || (agentRun.isWorking && agentRun.isIterating)
        : agentRun.agentState === AGENT_STATES.IDLE && !currentProjectId;

    return (
        <div className="workspace">
            <WorkspaceSidebar
                isOpen={sidebarOpen}
                onToggle={() => setSidebarOpen((open) => !open)}
                onNewProject={handleNewProject}
                onNavigate={navigate}
                projects={projects.projects}
                currentProjectId={currentProjectId}
                onSelectProject={(project) => projects.selectProject(project, navigate)}
                onDeleteProject={handleDeleteProject}
                usageSummary={usageSummary}
                media={media}
                onToggleTheme={toggleTheme}
                t={t}
            />

            <main className="workspace-main">
                <WorkspaceHeader
                    agentState={agentRun.agentState}
                    statusText={agentRun.getAgentStatusText()}
                    prompt={results.currentPrompt}
                    profile={isAuthenticated ? profile : null}
                    onProfileClick={() => navigate(ROUTES.SETTINGS)}
                    t={t}
                />

                <WorkspaceCanvas
                    agentRun={agentRun}
                    results={results}
                    projectLoad={{
                        projectLoadState: projects.projectLoadState,
                        projectLoadError: projects.projectLoadError
                    }}
                    projectStatus={projectStatus}
                    currentProjectId={currentProjectId}
                    currentPrompt={results.currentPrompt}
                    preferences={preferences}
                    language={language}
                    pendingSaves={agentRun.pendingArtifactSaves}
                    onApproveSave={actions.handleApproveArtifactSave}
                    onDismissSave={actions.dismissArtifactSave}
                    onRetryProjectLoad={projects.retryProjectLoad}
                    onRetryGeneration={handleRetryGeneration}
                    onNewProject={handleNewProject}
                    onOpenSetup={handleOpenSetup}
                    onPromptSelect={setChatInput}
                    hasApiKeys={isAIConfigured()}
                    onToggleAgentic={preferences.setAgenticMode}
                    onImageConfigChange={preferences.setImageConfig}
                    onPrevVersion={results.goToPrevVersion}
                    onNextVersion={results.goToNextVersion}
                    onDownloadImage={actions.handleDownloadImage}
                    onCopyText={results.copyCurrentVersionText}
                    onUseArtifactAsReference={actions.handleUseArtifactAsReference}
                    t={t}
                />

                {showComposer && (
                    <ChatInput
                        value={chatInput}
                        onChange={setChatInput}
                        onSubmit={handleIteration}
                        onStop={handleStop}
                        isWorking={agentRun.isGenerating}
                        isIterating={agentRun.isIterating}
                        creativeTaskMode={preferences.creativeTaskMode}
                        onTaskModeChange={preferences.setCreativeTaskMode}
                        attachedMedia={media.attachedMedia}
                        onRemoveAttachment={() => media.setAttachedMedia(null)}
                        activeAssets={activeAssets}
                        onToggleActiveAsset={media.toggleAssetActive}
                        onPickAttachment={media.attachFileAsContext}
                        modelLabel={models.getTextModelLabel()}
                        onShowModelModal={() => setShowModelModal(true)}
                        hasTextModel={models.hasTextModel}
                        isPro={isPro}
                        onShowProModal={() => setShowProModal(true)}
                        footer={(
                            <div className="oc-composer-footer">
                                <BatchButton
                                    onClick={() => setShowBatchModal(true)}
                                    disabled={agentRun.isGenerating || !chatInput.trim()}
                                />
                                <CalendarToggle
                                    onClick={() => setShowCalendar((open) => !open)}
                                    hasEntries={false}
                                />
                            </div>
                        )}
                        t={t}
                    />
                )}
            </main>

            <WorkspaceToolbar
                hasVersions={results.versions.length > 0}
                currentVersionHasImage={Boolean(results.currentVersion?.imageUrl)}
                isGeneratingImage={actions.isGeneratingImage}
                hasProject={Boolean(currentProjectId)}
                onOpenModelModal={() => setShowModelModal(true)}
                onSave={actions.handleSaveCurrentProject}
                onCopy={results.copyCurrentVersionText}
onGenerateImage={actions.handleGenerateImage}
                onOpenInIde={actions.handleOpenInIde}
                openInIdeLabel={ideAvailable
                    ? t('workspace.actions.openInIde', { app: ideIntegration.appName })
                    : t('workspace.actions.openInIdeNotConfigured')}
                onPublish={actions.handlePublishProject}
                onExport={actions.handleExportProject}
                onCopyAsApi={() => setShowCopyAsApi(true)}
                onDeleteProject={() => currentProjectId && handleDeleteProject(currentProjectId)}
                t={t}
            />

            <ContentCalendar
                isOpen={showCalendar}
                onClose={() => setShowCalendar(false)}
                onLoadContent={(content) => { setChatInput(content); setShowCalendar(false); }}
            />

            <BatchMode
                isOpen={showBatchModal}
                onClose={() => setShowBatchModal(false)}
                prompt={chatInput}
                onConfirm={handleBatchConfirm}
            />

            <ModelSelectionModal
                isOpen={showModelModal}
                onClose={() => setShowModelModal(false)}
                onSave={handleSaveModels}
                models={models}
                t={t}
            />

<CopyAsApiModal
                isOpen={showCopyAsApi}
                onClose={() => setShowCopyAsApi(false)}
                prompt={results.currentVersionPromptPreview}
                model={results.currentVersion?.model}
                t={t}
            />

            <OpenInIdeModal
                state={actions.openInIde}
                config={ideIntegration}
                onClose={actions.closeOpenInIde}
                t={t}
            />

            <PaywallModal
                isOpen={freemium.paywall.open}
                onClose={freemium.closePaywall}
                onViewPlan={() => {
                    freemium.closePaywall();
                    navigate(ROUTES.SETTINGS);
                }}
                title={freemium.paywall.title}
                message={freemium.paywall.message}
                t={t}
            />

            <NoticeModal
                notice={agentRun.infoModal}
                onClose={agentRun.closeInfoModal}
                onRetry={handleRetryGeneration}
                t={t}
            />

            <ProModal isOpen={showProModal} onClose={() => setShowProModal(false)} t={t} />
        </div>
    );
}

export default Workspace;