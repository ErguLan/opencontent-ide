/**
 * WorkspaceCanvas - the main working area.
 *
 * Purely presentational: it decides which state to render from the agent state
 * and the version list, and delegates every action to its props.
 */

import Button from '../../../components/common/Button';
import Icon, { ICONS } from '../../../components/icons/Icon';
import Loader from '../../../components/common/Loader';
import QuickPrompts from './QuickPrompts';
import AgenticToggle from './AgenticToggle';
import ImageConfigPanel from './ImageConfigPanel';
import AgentStepsLog from './AgentStepsLog';
import WorkspaceResultCard from './WorkspaceResultCard';
import WorkspaceNotConfigured from './WorkspaceNotConfigured';
import WorkspaceImageModelMissing from './WorkspaceImageModelMissing';
import { AGENT_STATES, BATCH_RUN_STATUS } from '../hooks/useAgentRun';
import { PROJECT_LOAD_STATES, PROJECT_STATUS } from '../hooks/useWorkspaceProjects';
import { ALLOW_IMAGE_CONFIG_WITHOUT_AGENTIC } from '../../../config/constants';

const BATCH_STATUS_KEYS = Object.freeze({
    [BATCH_RUN_STATUS.WORKING]: 'workspace.batch.progress',
    [BATCH_RUN_STATUS.CANCELLED]: 'workspace.batch.cancelled',
    [BATCH_RUN_STATUS.COMPLETE]: 'workspace.batch.completed'
});

function WorkspaceCanvas({
    agentRun,
    results,
    projectLoad,
    projectStatus,
    currentProjectId,
    currentPrompt,
    preferences,
    language,
    hasApiKeys,
    pendingSaves,
    onApproveSave,
    onDismissSave,
    onRetryProjectLoad,
    onRetryGeneration,
    onNewProject,
    onOpenSetup,
    onPromptSelect,
    onToggleAgentic,
    onImageConfigChange,
    onPrevVersion,
    onNextVersion,
    onDownloadImage,
    onCopyText,
    onUseArtifactAsReference,
    t
}) {
    const {
        agentState,
        errorMessage,
        isWorking,
        isIterating,
        agentSteps,
        batchProgress,
        hasRetryRequest: canRetryRun
    } = agentRun;
    const {
        versions,
        currentVersion,
        currentVersionIndex,
        displayedText
    } = results;
    const { projectLoadState, projectLoadError } = projectLoad;
    const { agenticMode, imageConfig, showLastPromptInResult } = preferences;

    const showResult = (agentState === AGENT_STATES.COMPLETE || (isWorking && isIterating))
        && versions.length > 0;
    const canRetry = canRetryRun;

    const renderProjectRouteState = () => {
        if (!currentProjectId) return null;
        if (projectLoadState === PROJECT_LOAD_STATES.LOADING) {
            return (
                <div className="workspace-route-state workspace-route-state-loading" role="status" aria-live="polite">
                    <Loader variant="dots" size="sm" />
                    <span>{t('workspace.projectLoading')}</span>
                </div>
            );
        }
        if (projectLoadState === PROJECT_LOAD_STATES.ERROR) {
            return (
                <div className="workspace-route-state workspace-route-state-error" role="alert">
                    <Icon src={ICONS.INFO} size="lg" alt="" />
                    <h3>{t('workspace.projectLoadErrorTitle')}</h3>
                    <p>{projectLoadError || t('workspace.projectLoadErrorMessage')}</p>
                    <div className="workspace-route-state-actions">
                        <Button variant="secondary" onClick={onRetryProjectLoad}>{t('common.retry')}</Button>
                        <Button variant="primary" onClick={onNewProject}>{t('workspace.startNewProject')}</Button>
                    </div>
                </div>
            );
        }
        if (projectLoadState === PROJECT_LOAD_STATES.READY && projectStatus !== PROJECT_STATUS.ERROR && versions.length === 0) {
            const isDraft = projectStatus === PROJECT_STATUS.DRAFT;
            return (
                <div className="workspace-project-empty-state">
                    <Icon src={ICONS.EMPTY} size="lg" alt="" />
                    <h3>{isDraft ? t('workspace.projectDraftTitle') : t('workspace.projectEmptyTitle')}</h3>
                    <p>{isDraft ? t('workspace.projectDraftMessage') : t('workspace.projectEmptyMessage')}</p>
                    {currentPrompt && <div className="workspace-project-prompt">{currentPrompt}</div>}
                    <div className="workspace-route-state-actions">
                        <Button variant="primary" onClick={onRetryGeneration} disabled={!canRetry}>
                            {t('workspace.retryGeneration')}
                        </Button>
                        <Button variant="secondary" onClick={onNewProject}>{t('workspace.startNewProject')}</Button>
                    </div>
                </div>
            );
        }
        return null;
    };

    const renderAgentState = () => {
if (agentState === AGENT_STATES.NOT_CONFIGURED) {
            return <WorkspaceNotConfigured onOpenSetup={onOpenSetup} t={t} />;
        }
        if (agentState === AGENT_STATES.IMAGE_MODEL_MISSING) {
            return <WorkspaceImageModelMissing onOpenSetup={onOpenSetup} t={t} />;
        }

        if (agentState === AGENT_STATES.ERROR) {
            return (
                <div className="canvas-error animate-fadeInUp">
                    <Icon src={ICONS.INFO} size="xl" alt="" />
                    <h3>{t('errors.generic')}</h3>
                    <p className="workspace-error-detail">{errorMessage || t('errors.generic')}</p>
                    <div className="workspace-route-state-actions">
                        <Button variant="primary" onClick={onRetryGeneration} disabled={!canRetry}>
                            {t('workspace.retryGeneration')}
                        </Button>
                        <Button variant="secondary" onClick={onNewProject}>{t('workspace.startNewProject')}</Button>
                    </div>
                </div>
            );
        }

        if (isWorking && !isIterating) {
            const batchText = batchProgress
                ? t(BATCH_STATUS_KEYS[batchProgress.status] || 'workspace.batch.progress', {
                    current: batchProgress.current,
                    total: batchProgress.total,
                    count: batchProgress.current
                })
                : '';
            return (
                <div className="canvas-loading">
                    {batchText && <div className="batch-progress-summary" role="status" aria-live="polite">{batchText}</div>}
                    <AgentStepsLog steps={agentSteps} />
                    <Loader variant="Agent" size="lg" />
                </div>
            );
        }

        if (showResult) {
            return (
                <WorkspaceResultCard
                    version={currentVersion}
                    versionNumber={currentVersionIndex + 1}
                    versionCount={versions.length}
                    displayedText={displayedText}
isIterating={isIterating}
                    showPrompt={showLastPromptInResult}
                    onPrevVersion={onPrevVersion}
                    onNextVersion={onNextVersion}
                    onDownloadImage={onDownloadImage}
                    onCopyText={onCopyText}
onUseArtifactAsReference={onUseArtifactAsReference}
                    onApproveSave={onApproveSave}
                    onRetry={onRetryGeneration}
                    t={t}
                />
            );
        }

        if (agentState === AGENT_STATES.IDLE && versions.length === 0 && !currentProjectId) {
            return (
                <div className="canvas-empty">
                    <Icon src={ICONS.EMPTY} size="xl" alt="" />
                    <p>{t('workspace.untitled')}</p>
                    <QuickPrompts
                        language={language}
                        onSelect={onPromptSelect}
                        hasApiKeys={hasApiKeys}
                    />
                </div>
            );
        }

        return null;
    };

    return (
        <div className="workspace-canvas">
            <div className="workspace-editor-controls">
                <span className="workspace-editor-mode-label">{t('workspace.editorMode')}</span>
                <AgenticToggle
                    isActive={agenticMode}
                    onToggle={onToggleAgentic}
                    isRunning={Boolean(agentRun.isGenerating)}
                />
            </div>

            {(agenticMode || ALLOW_IMAGE_CONFIG_WITHOUT_AGENTIC) && (
                <ImageConfigPanel
                    config={imageConfig}
                    onChange={onImageConfigChange}
                    isVisible
                />
            )}

            {pendingSaves.length > 0 && (
                <div className="workspace-pending-saves" role="status" aria-live="polite">
                    <strong>{t('workspace.pendingSaves.title')}</strong>
                    {pendingSaves.map((request) => (
                        <div className="workspace-pending-save" key={request.assetId}>
                            <span>{request.filename}</span>
                            <div className="workspace-pending-save-actions">
                                <Button variant="primary" onClick={() => onApproveSave(request)}>
                                    {t('workspace.pendingSaves.approve')}
                                </Button>
                                <Button variant="secondary" onClick={() => onDismissSave(request.assetId)}>
                                    {t('common.close')}
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {renderProjectRouteState()}
            {renderAgentState()}
        </div>
    );
}

export default WorkspaceCanvas;