/**
 * AgenticToggle — Agentic Mode switch for the workspace canvas.
 *
 * When ON: the AI can iterate autonomously, analyze images and chain operations.
 * Shows a token-consumption warning before activating, and refuses to turn off
 * while a task is running.
 */

import { useState } from 'react';
import Icon, { ICONS } from '../../../components/icons/Icon';
import { useLanguage } from '../../../context/LanguageContext';
import { setAgenticMode } from './agenticModeStorage';

const BENEFITS = Object.freeze([
    'workspace.agentic.feature1',
    'workspace.agentic.feature2',
    'workspace.agentic.feature3',
    'workspace.agentic.feature4'
]);

function AgenticToggle({ isActive, onToggle, isRunning = false }) {
    const { t } = useLanguage();
    const [showWarning, setShowWarning] = useState(false);
    const [showCantDisable, setShowCantDisable] = useState(false);

    const handleClick = () => {
        if (isActive) {
            if (isRunning) {
                setShowCantDisable(true);
                return;
            }
            setAgenticMode(false);
            onToggle(false);
            return;
        }
        setShowWarning(true);
    };

    const handleConfirmActivate = () => {
        setShowWarning(false);
        setAgenticMode(true);
        onToggle(true);
    };

    return (
        <>
            <button
                type="button"
                className={`agentic-toggle ${isActive ? 'agentic-active' : ''}`}
                onClick={handleClick}
                aria-pressed={isActive}
                title={isActive ? t('workspace.agentic.toggleOn') : t('workspace.agentic.toggleOff')}
            >
                <Icon src={isActive ? ICONS.FOQUITO : ICONS.ITERATE} size="xs" alt="" />
                <span className="agentic-label">{isActive ? t('workspace.agentic.on') : t('workspace.agentic.off')}</span>
                {isActive && <span className="agentic-pulse" />}
            </button>

            {showWarning && (
                <div className="agentic-modal-overlay" onClick={() => setShowWarning(false)}>
                    <div className="agentic-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
                        <div className="agentic-modal-header">
                            <Icon src={ICONS.FOQUITO} size="md" alt="" />
                            <h3>{t('workspace.agentic.activateTitle')}</h3>
                        </div>

                        <div className="agentic-modal-body">
                            <p className="agentic-modal-desc">{t('workspace.agentic.description')}</p>

                            <div className="agentic-features">
                                {BENEFITS.map((key, index) => (
                                    <div className="agentic-feature" key={key}>
                                        <span className="agentic-feature-icon">{index + 1}</span>
                                        <span>{t(key)}</span>
                                    </div>
                                ))}
                            </div>

                            <div className="agentic-warning-box">
                                <Icon src={ICONS.INFO} size="xs" alt="" />
                                <span>
                                    <strong>{t('workspace.agentic.tokenWarning')}:</strong>{' '}
                                    {t('workspace.agentic.tokenWarningText')}
                                </span>
                            </div>
                        </div>

                        <div className="agentic-modal-actions">
                            <button
                                type="button"
                                className="agentic-btn-cancel"
                                onClick={() => setShowWarning(false)}
                            >
                                {t('workspace.agentic.cancel')}
                            </button>
                            <button type="button" className="agentic-btn-activate" onClick={handleConfirmActivate}>
                                {t('workspace.agentic.activate')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showCantDisable && (
                <div className="agentic-modal-overlay" onClick={() => setShowCantDisable(false)}>
                    <div className="agentic-modal agentic-modal-small" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
                        <div className="agentic-modal-header">
                            <Icon src={ICONS.CONFIG} size="sm" alt="" />
                            <h3>{t('workspace.agentic.cantDisableTitle')}</h3>
                        </div>
                        <div className="agentic-modal-body">
                            <p className="agentic-modal-desc">{t('workspace.agentic.cantDisableMessage')}</p>
                        </div>
                        <div className="agentic-modal-actions">
                            <button
                                type="button"
                                className="agentic-btn-activate"
                                onClick={() => setShowCantDisable(false)}
                            >
                                {t('workspace.agentic.gotIt')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

export default AgenticToggle;