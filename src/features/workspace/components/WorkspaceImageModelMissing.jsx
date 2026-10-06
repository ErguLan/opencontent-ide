/**
 * WorkspaceImageModelMissing — says plainly that no image model is configured.
 *
 * A visual request used to be accepted, fail deep inside the agentic run and
 * surface as a generic provider error. The workspace now detects the gap before
 * spending a request and sends the user straight to the model registration step.
 */

import Button from '../../../components/common/Button';
import Icon, { ICONS } from '../../../components/icons/Icon';

function WorkspaceImageModelMissing({ onOpenSetup, t }) {
    return (
        <div className="canvas-error animate-fadeInUp">
            <Icon src={ICONS.INFO} size="xl" alt="" />
            <h3>{t('workspace.imageModelMissingTitle')}</h3>
            <p>{t('workspace.imageModelMissingMessage')}</p>
            <p className="workspace-error-detail">{t('workspace.imageModelMissingHint')}</p>
            <div className="workspace-route-state-actions">
                <Button variant="primary" onClick={onOpenSetup} icon={ICONS.CONFIG}>
                    {t('workspace.imageModelMissingCta')}
                </Button>
            </div>
        </div>
    );
}

export default WorkspaceImageModelMissing;