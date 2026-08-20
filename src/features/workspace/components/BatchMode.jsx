/**
 * BatchMode — Generate multiple variations at once
 * OpenContent IDE
 * 
 * Confirmation modal + batch button.
 * User can generate 3-10 variations of a prompt with one click.
 */

import { useState } from 'react';
import { useLanguage } from '../../../context/LanguageContext';
import Modal from '../../../components/common/Modal';
import Button from '../../../components/common/Button';

function BatchMode({ isOpen, onClose, onConfirm, prompt }) {
    const { t } = useLanguage();
    const [count, setCount] = useState(5);

    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={t('workspace.batch.title')}>
            <div style={{ marginBottom: '16px' }}>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '12px' }}>
                    {t('workspace.batch.description')}
                </p>

                <div style={{ marginBottom: '12px' }}>
                    <label style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                        {t('workspace.batch.currentPrompt')}
                    </label>
                    <div style={{
                        background: 'var(--bg-tertiary, #1a1a1a)',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        fontSize: '13px',
                        color: 'var(--text-secondary)',
                        maxHeight: '80px',
                        overflow: 'auto'
                    }}>
                        {prompt || t('workspace.batch.noPrompt')}
                    </div>
                </div>

                <div style={{ marginBottom: '12px' }}>
                    <label style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                        {t('workspace.batch.variationsCount')} {count}
                    </label>
                    <input
                        type="range"
                        min={2}
                        max={10}
                        value={count}
                        onChange={e => setCount(Number(e.target.value))}
                        style={{ width: '100%', accentColor: 'var(--color-primary, #7c3aed)' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-tertiary)' }}>
                        <span>2</span>
                        <span>10</span>
                    </div>
                </div>

                <div style={{
                    background: 'var(--bg-secondary, #222)',
                    padding: '10px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: 'var(--text-tertiary)',
                    textAlign: 'center'
                }}>
                    {t('workspace.batch.tokenUsage', { count })}
                </div>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
                <Button variant="secondary" onClick={onClose} style={{ flex: 1 }}>
                    {t('common.cancel')}
                </Button>
                <Button
                    variant="primary"
                    onClick={() => onConfirm(count)}
                    disabled={!prompt?.trim()}
                    style={{ flex: 1 }}
                >
                    {t('workspace.batch.generate', { count })}
                </Button>
            </div>
        </Modal>
    );
}

/**
 * BatchButton — Trigger button for batch mode
 */
export function BatchButton({ onClick, disabled }) {
    const { t } = useLanguage();
    return (
        <button
            type="button"
            className="batch-mode-btn"
            onClick={onClick}
            disabled={disabled}
            title={t('workspace.batch.title')}
            style={{
                background: 'var(--bg-secondary, #2a2a2a)',
                border: '1px solid var(--border-color, #333)',
                borderRadius: '8px',
                padding: '6px 12px',
                color: 'var(--text-secondary, #aaa)',
                cursor: disabled ? 'not-allowed' : 'pointer',
                fontSize: '12px',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                opacity: disabled ? 0.5 : 1,
                transition: 'all 0.2s ease'
            }}
        >
            {t('workspace.batch.title')}
        </button>
    );
}

export default BatchMode;
