/**
 * BatchMode — Generate multiple variations at once
 * OpenContent IDE
 * 
 * Confirmation modal + batch button.
 * User can generate 3-10 variations of a prompt with one click.
 */

import { useState } from 'react';
import Modal from '../../../components/common/Modal';
import Button from '../../../components/common/Button';

function BatchMode({ open, onClose, onConfirm, prompt }) {
    const [count, setCount] = useState(5);

    if (!open) return null;

    return (
        <Modal open={open} onClose={onClose} title="Batch Generate">
            <div style={{ marginBottom: '16px' }}>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '12px' }}>
                    Generate multiple variations of your prompt at once. Each variation uses slightly different parameters for diverse results.
                </p>

                <div style={{ marginBottom: '12px' }}>
                    <label style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                        Current prompt:
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
                        {prompt || 'No prompt entered yet'}
                    </div>
                </div>

                <div style={{ marginBottom: '12px' }}>
                    <label style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                        Number of variations: {count}
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
                    This will use ~{count}x your normal token usage
                </div>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
                <Button variant="secondary" onClick={onClose} style={{ flex: 1 }}>
                    Cancel
                </Button>
                <Button
                    variant="primary"
                    onClick={() => onConfirm(count)}
                    disabled={!prompt?.trim()}
                    style={{ flex: 1 }}
                >
                    Generate {count} variations
                </Button>
            </div>
        </Modal>
    );
}

/**
 * BatchButton — Trigger button for batch mode
 */
export function BatchButton({ onClick, disabled }) {
    return (
        <button
            type="button"
            className="batch-mode-btn"
            onClick={onClick}
            disabled={disabled}
            title="Batch Generate — Create multiple variations"
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
            ⚡ Batch
        </button>
    );
}

export default BatchMode;
