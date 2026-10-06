/**
 * WorkspaceResultCard — the produced version.
 *
 * Shows version navigation, the prompt used, the response text, the generated
 * visual, the copy/download actions, the step summary and, when the run was
 * partial, an explicit notice of what failed.
 */

import Icon, { ICONS } from '../../../components/icons/Icon';
import AgentStepsLog from './AgentStepsLog';
import ArtifactPanel from './ArtifactPanel';
import PartialFailureNotice from './PartialFailureNotice';
import { isTerminalStepStatus } from '../utils/agentSteps';

const PREV_ROTATION = 'rotate(-90deg)';
const NEXT_ROTATION = 'rotate(90deg)';

function WorkspaceResultCard({
    version,
    versionNumber,
    versionCount,
    displayedText,
    showPrompt,
    isIterating,
    onPrevVersion,
    onNextVersion,
    onDownloadImage,
    onCopyText,
    onUseArtifactAsReference,
    onApproveSave,
    onRetry,
    t
}) {
    if (!version) return null;

    const showNavigation = versionCount > 1;
    const hasText = Boolean(version.result && version.result.trim());
    // While a new iteration runs the previous text stays visible (blurred)
    // instead of collapsing to an empty card.
    const body = isIterating ? version.result : (displayedText || version.result);
    const promptPreview = (version.imagePrompt || version.prompt || '').trim();
    const finishedSteps = (version.steps || []).filter((step) => isTerminalStepStatus(step.status));

    return (
        <div className={`canvas-result animate-fadeInUp ${isIterating ? 'iterating-blur' : ''}`}>
            {showNavigation && (
                <div className="version-navigation">
                    <button
                        type="button"
                        className="nav-btn"
                        onClick={onPrevVersion}
                        disabled={versionNumber <= 1}
                        aria-label={t('workspace.previousVersion')}
                    >
                        <Icon src={ICONS.RELOAD} size="xs" style={{ transform: PREV_ROTATION }} alt="" />
                    </button>
                    <span className="version-indicator">{versionNumber} / {versionCount}</span>
                    <button
                        type="button"
                        className="nav-btn"
                        onClick={onNextVersion}
                        disabled={versionNumber >= versionCount}
                        aria-label={t('workspace.nextVersion')}
                    >
                        <Icon src={ICONS.RELOAD} size="xs" style={{ transform: NEXT_ROTATION }} alt="" />
                    </button>
                </div>
            )}

            <div className="result-card">
                <div className="result-header">
                    <span className="result-type">
                        {version.imageUrl ? t('workspace.result.contentVisual') : t('workspace.result.contentOnly')}
                    </span>
                    {version.model && <span className="result-model">{version.model}</span>}
                </div>

                <div className="result-content">
                    {showPrompt && promptPreview && (
                        <div className="result-context-strip" role="note" aria-label={t('workspace.promptUsed')}>
                            <span className="context-label">{t('workspace.prompt')}</span>
                            <span className="context-text">{promptPreview}</span>
                        </div>
                    )}

                    {hasText ? (
                        <div className="result-text">{body}</div>
                    ) : (
                        <div className="result-text result-text-empty">{t('workspace.visualNoText')}</div>
                    )}

                    {version.imageUrl && (
                        <div className="result-image" role="region" aria-label={t('workspace.accessibility.imageAlt')}>
                            <img
                                src={version.imageUrl}
                                alt={version.imagePrompt || t('workspace.accessibility.imageAlt')}
                            />
                            <div className="image-actions">
                                <button
                                    type="button"
                                    className="image-download-btn"
                                    onClick={() => onDownloadImage(version.imageUrl)}
                                    title={t('workspace.actions.download')}
                                    aria-label={t('workspace.actions.download')}
                                >
                                    <Icon src={ICONS.DOWNLOAD} size="sm" alt="" />
                                </button>
                            </div>
                        </div>
                    )}

                    {Array.isArray(version.imageRevisions) && version.imageRevisions.length > 0 && (
                        <ArtifactPanel
                            artifacts={version.imageRevisions}
                            agentSteps={version.agenticSteps || []}
                            onUseAsReference={onUseArtifactAsReference}
                            onApproveSave={onApproveSave}
                            t={t}
                        />
                    )}

                    <button
                        type="button"
                        className="result-copy-text-btn"
                        onClick={onCopyText}
                        aria-label={t('workspace.copyText')}
                    >
                        <Icon src={ICONS.COPY} size="sm" alt="" />
                        <span>{t('workspace.copyText')}</span>
                    </button>
                </div>

                <div className="result-footer">
                    <AgentStepsLog steps={finishedSteps} compact />
                    {version.agenticFailures?.length > 0 && (
                        <PartialFailureNotice
                            failures={version.agenticFailures}
                            retryable={version.agenticRetryable}
                            onRetry={onRetry}
                            t={t}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

export default WorkspaceResultCard;