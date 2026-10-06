/**
 * WorkspaceHeader — agent status, current prompt and account entry point.
 */

import Icon, { ICONS } from '../../../components/icons/Icon';
import Loader from '../../../components/common/Loader';
import { AGENT_STATES } from '../hooks/useAgentRun';

function WorkspaceHeader({
    agentState,
    statusText,
    prompt,
    profile,
    onProfileClick,
    t
}) {
    const showWorking = agentState === AGENT_STATES.ANALYZING || agentState === AGENT_STATES.GENERATING;

    return (
        <header className="workspace-header">
            <div className="header-left">
                {showWorking && (
                    <div className="agent-status" aria-live="polite">
                        <Loader variant="dots" size="sm" />
                        <span>{statusText}</span>
                    </div>
                )}
                {agentState === AGENT_STATES.COMPLETE && (
                    <div className="agent-status complete" aria-live="polite">
                        <Icon src={ICONS.CHECK} size="sm" alt="" />
                        <span>{t('Agent.complete')}</span>
                    </div>
                )}
                {(agentState === AGENT_STATES.ERROR || agentState === AGENT_STATES.NOT_CONFIGURED) && (
                    <div className="agent-status error" aria-live="polite">
                        <Icon src={ICONS.INFO} size="sm" alt="" />
                        <span>{statusText}</span>
                    </div>
                )}
            </div>

            <div className="header-center">
                <span className="prompt-preview">{prompt || t('workspace.untitled')}</span>
            </div>

            <div className="header-right">
                {profile && (
                    <button
                        type="button"
                        className="user-avatar-small"
                        onClick={onProfileClick}
                        aria-label={profile.displayName || t('settings.title')}
                    >
                        {profile.avatarUrl ? (
                            <img src={profile.avatarUrl} alt={profile.displayName || ''} />
                        ) : (
                            <span>
                                {profile.displayName?.charAt(0) || profile.email?.charAt(0) || '?'}
                            </span>
                        )}
                    </button>
                )}
            </div>
        </header>
    );
}

export default WorkspaceHeader;