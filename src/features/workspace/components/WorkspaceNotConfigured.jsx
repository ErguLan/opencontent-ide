/**
 * WorkspaceNotConfigured — the only entry point to the AI setup flow.
 *
 * The workspace never asks the user to edit a `.env` file: credentials and model
 * registration live in the `/setup` surface, which is where this CTA goes.
 */

import Button from '../../../components/common/Button';
import Icon, { ICONS } from '../../../components/icons/Icon';

function WorkspaceNotConfigured({ onOpenSetup, t }) {
    return (
        <div className="canvas-error animate-fadeInUp">
            <Icon src={ICONS.INFO} size="xl" alt="" />
            <h3>{t('workspace.apiKeyRequiredTitle')}</h3>
            <p>{t('workspace.apiKeyRequiredMessage')}</p>
            <p className="workspace-error-detail">{t('workspace.setupRequiredHint')}</p>
            <div className="workspace-route-state-actions">
                <Button variant="primary" onClick={onOpenSetup} icon={ICONS.CONFIG}>
                    {t('workspace.setupCta')}
                </Button>
            </div>
        </div>
    );
}

export default WorkspaceNotConfigured;