/**
 * WorkspaceModals — paywall, notice and PRO dialogs.
 */

import Button from '../../../components/common/Button';
import Icon, { ICONS } from '../../../components/icons/Icon';
import Modal from '../../../components/common/Modal';

const PRO_PURCHASE_URL = 'https://www.opencontent.ide/#settings?section=profile';

const PRO_SECTIONS = Object.freeze([
    ['pro.modal.sectionStudioTitle', ['pro.modal.benefitModels', 'pro.modal.benefitLimits']],
    ['pro.modal.sectionIdeTitle', ['pro.modal.benefitIde', 'pro.modal.benefitWorkflow']],
    ['pro.modal.sectionSiteTitle', ['pro.modal.benefitSite', 'pro.modal.benefitProfile']]
]);

function PaywallModal({ isOpen, onClose, onViewPlan, title, message, t }) {
    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={title || t('paywall.defaultTitle')}
            footer={(
                <>
                    <Button variant="secondary" onClick={onClose}>{t('common.close')}</Button>
                    <Button variant="primary" onClick={onViewPlan}>{t('paywall.viewPlan')}</Button>
                </>
            )}
        >
            <p>{message}</p>
        </Modal>
    );
}

function NoticeModal({ notice, onClose, onRetry, t }) {
    return (
        <Modal
            isOpen={Boolean(notice.open)}
            onClose={onClose}
            title={notice.title}
            footer={(
                <div className="workspace-modal-actions">
                    <Button variant="secondary" onClick={onClose}>{t('common.close')}</Button>
                    {notice.canRetry && (
                        <Button variant="primary" onClick={onRetry}>{t('workspace.retryGeneration')}</Button>
                    )}
                </div>
            )}
        >
            <p className="workspace-error-detail">{notice.message}</p>
        </Modal>
    );
}

function ProModal({ isOpen, onClose, t }) {
    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={t('pro.modal.title')}
            className="modal-pro"
            footer={(
                <>
                    <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
                    <Button
                        variant="primary"
                        onClick={() => window.open(PRO_PURCHASE_URL, '_blank', 'noopener,noreferrer')}
                    >
                        {t('pro.modal.buy')}
                    </Button>
                </>
            )}
        >
            <div className="pro-hero">
                <div className="pro-hero-badge">
                    <Icon src={ICONS.PRO} size={28} alt="" />
                    <div className="pro-hero-title">{t('pro.modal.heroTitle')}</div>
                </div>
                <div className="pro-hero-sub">{t('pro.modal.subtitle')}</div>
            </div>

            <div className="pro-grid">
                {PRO_SECTIONS.map(([sectionTitle, benefits]) => (
                    <div className="pro-card" key={sectionTitle}>
                        <div className="pro-card-title">{t(sectionTitle)}</div>
                        <ul className="pro-benefits-list">
                            {benefits.map((benefit) => <li key={benefit}>{t(benefit)}</li>)}
                        </ul>
                    </div>
                ))}
            </div>

            <div className="pro-footnote">{t('pro.modal.noteRedirect')}</div>
        </Modal>
    );
}

export { PaywallModal, NoticeModal, ProModal };