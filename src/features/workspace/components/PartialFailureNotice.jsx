/**
 * PartialFailureNotice — what a partial run produced and what it could not.
 *
 * A partial run is a success: the text and the images that did finish are shown
 * normally, and this notice explains which steps failed. A retry is offered only
 * when the pipeline marked the failure as retryable.
 */

import Button from '../../../components/common/Button';
import Icon, { ICONS } from '../../../components/icons/Icon';

function PartialFailureNotice({ failures, retryable, onRetry, t }) {
    const failureList = Array.isArray(failures) ? failures : [];
    if (failureList.length === 0) return null;

    return (
        <div className="oc-partial-notice" role="status" aria-live="polite">
            <div className="oc-partial-notice-header">
                <Icon src={ICONS.INFO} size="sm" alt="" />
                <strong>{t('settings.agentic.partialFailureNotice', { count: failureList.length })}</strong>
            </div>
            <ul className="oc-partial-notice-list">
                {failureList.map((failure) => (
                    <li key={`${failure.stepId}-${failure.code}`}>
                        <span className="oc-partial-notice-step">{failure.name || failure.stepId}</span>
                        <span className="oc-partial-notice-message">{failure.message}</span>
                    </li>
                ))}
            </ul>
            {retryable && onRetry && (
                <Button variant="secondary" onClick={onRetry} icon={ICONS.RELOAD}>
                    {t('workspace.retryGeneration')}
                </Button>
            )}
        </div>
    );
}

export default PartialFailureNotice;