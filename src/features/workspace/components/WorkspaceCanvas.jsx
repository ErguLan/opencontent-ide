/**
 * WorkspaceCanvas — Main content display area
 * OpenContent IDE
 */
import Icon, { ICONS } from '../../../components/icons/Icon';
import Loader from '../../../components/common/Loader';
import Button from '../../../components/common/Button';

const AGENT_STATES = {
    IDLE: 'IDLE',
    ANALYZING: 'ANALYZING',
    GENERATING: 'GENERATING',
    COMPLETE: 'COMPLETE',
    ERROR: 'ERROR'
};

function WorkspaceCanvas({
    agentState, errorMessage, isIterating, isGenerating,
    agentSteps, versions, currentVersionIndex, currentVersion,
    displayedText, showLastPromptInResult,
    onPrevVersion, onNextVersion, onDownloadImage, onCopyText, onExport,
    isAIConfigured, t
}) {
    const isWorking = agentState === AGENT_STATES.ANALYZING || agentState === AGENT_STATES.GENERATING;

    // No API key configured
    if (!isAIConfigured) {
        return (
            <div className="workspace-canvas">
                <div className="canvas-error animate-fadeInUp">
                    <h3>API Key Required</h3>
                    <p>Add your OpenRouter API key to <code>.env</code>:</p>
                    <pre className="code-block">VITE_OPENROUTER_API_KEY=your_key</pre>
                    <p>Or use Ollama for 100% local AI.</p>
                </div>
            </div>
        );
    }

    // Error state
    if (agentState === AGENT_STATES.ERROR && errorMessage) {
        return (
            <div className="workspace-canvas">
                <div className="canvas-error animate-fadeInUp">
                    <h3>{t('workspace.error')}</h3>
                    <p>{errorMessage}</p>
                </div>
            </div>
        );
    }

    // Loading state
    if (isWorking || (isIterating && !currentVersion)) {
        return (
            <div className="workspace-canvas">
                <div className="canvas-loading">
                    <div className="agent-steps-log">
                        {agentSteps.map(step => (
                            <div key={step.id} className={`step-item ${step.status}`}>
                                <div className="step-dot" />
                                <span className="step-text">{step.text}</span>
                            </div>
                        ))}
                    </div>
                    <Loader size="lg" />
                </div>
            </div>
        );
    }

    // Result state
    if (currentVersion) {
        return (
            <div className="workspace-canvas">
                <div className={`canvas-result animate-fadeInUp ${isIterating ? 'iterating-blur' : ''}`}>
                    {/* Version navigation */}
                    <div className="version-navigation">
                        <button className="nav-btn" onClick={onPrevVersion} disabled={currentVersionIndex <= 0}>
                            ◀
                        </button>
                        <span className="version-indicator">{currentVersionIndex + 1} / {versions.length}</span>
                        <button className="nav-btn" onClick={onNextVersion} disabled={currentVersionIndex >= versions.length - 1}>
                            ▶
                        </button>
                    </div>

                    {/* Result card */}
                    <div className="result-card">
                        <div className="result-header">
                            <span className="result-type">
                                {currentVersion.type === 'image' ? '🎨' : '📝'}
                            </span>
                            <span className="result-model">{currentVersion.model}</span>
                        </div>

                        <div className="result-content">
                            {showLastPromptInResult && currentVersion.prompt && (
                                <p className="result-prompt-display">
                                    <em>{currentVersion.prompt}</em>
                                </p>
                            )}

                            {currentVersion.type === 'text' && (
                                <div className="result-text">
                                    {displayedText || currentVersion.result || ''}
                                </div>
                            )}

                            {currentVersion.type === 'text' && !currentVersion.result && (
                                <div className="result-text result-text-empty">
                                    <p>{t('workspace.noContent')}</p>
                                </div>
                            )}

                            {currentVersion.type === 'image' && currentVersion.result && (
                                <div className="result-image" role="region" aria-label={t('workspace.accessibility.imageArea')}>
                                    <img src={currentVersion.result} alt="Generated content" />
                                    <div className="image-actions">
                                        <button
                                            className="image-download-btn"
                                            onClick={() => onDownloadImage(currentVersion.result)}
                                            aria-label={t('workspace.accessibility.downloadImage')}
                                        >
                                            <Icon src={ICONS.DOWNLOAD} size="sm" />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {currentVersion.type === 'text' && currentVersion.result && (
                            <button
                                className="result-copy-text-btn"
                                onClick={() => onCopyText(currentVersion.result)}
                                aria-label="Copy text"
                            >
                                <Icon src={ICONS.COPY} size="sm" /> Copy
                            </button>
                        )}

                        <div className="result-footer">
                            <div className="agent-steps-compact">
                                {(currentVersion.steps || []).map(step => (
                                    <div key={step.id} className="step-pill">
                                        {step.text}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Empty state
    return (
        <div className="workspace-canvas">
            <div className="canvas-empty">
                <h2>{t('workspace.emptyTitle')}</h2>
                <p>{t('workspace.emptyDescription')}</p>
            </div>
        </div>
    );
}

export default WorkspaceCanvas;
