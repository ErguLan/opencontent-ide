/**
 * AgenticToggle — Agentic Mode switch for the workspace chat
 * OpenContent IDE
 * 
 * When ON: AI can iterate autonomously, analyze images, chain operations.
 * Shows a warning modal about token consumption when activating.
 * Cannot be deactivated while an agentic task is running.
 */

import { useState } from 'react';

const AGENTIC_STORAGE_KEY = 'oc_agentic_mode';

export function getAgenticMode() {
    return localStorage.getItem(AGENTIC_STORAGE_KEY) === 'true';
}

function AgenticToggle({ isActive, onToggle, isRunning = false }) {
    const [showWarning, setShowWarning] = useState(false);
    const [showCantDisable, setShowCantDisable] = useState(false);

    const handleClick = () => {
        if (isActive) {
            if (isRunning) {
                setShowCantDisable(true);
                return;
            }
            onToggle(false);
            localStorage.setItem(AGENTIC_STORAGE_KEY, 'false');
        } else {
            setShowWarning(true);
        }
    };

    const handleConfirmActivate = () => {
        setShowWarning(false);
        onToggle(true);
        localStorage.setItem(AGENTIC_STORAGE_KEY, 'true');
    };

    return (
        <>
            <button
                type="button"
                className={`agentic-toggle ${isActive ? 'agentic-active' : ''}`}
                onClick={handleClick}
                title={isActive ? 'Agentic Mode: ON' : 'Agentic Mode: OFF'}
            >
                <svg className="agentic-icon-svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {isActive ? (
                        <>
                            <path d="M12 2a4 4 0 0 1 4 4c0 1.5-.8 2.8-2 3.5v1.5h-4v-1.5C8.8 8.8 8 7.5 8 6a4 4 0 0 1 4-4z"/>
                            <path d="M10 13h4v2a2 2 0 0 1-4 0v-2z"/>
                            <path d="M5 6h-2"/>
                            <path d="M21 6h-2"/>
                            <path d="M12 18v4"/>
                            <path d="M7.5 2.5l-1-1"/>
                            <path d="M17.5 2.5l1-1"/>
                        </>
                    ) : (
                        <>
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                        </>
                    )}
                </svg>
                <span className="agentic-label">{isActive ? 'Agentic' : 'Chat'}</span>
                {isActive && <span className="agentic-pulse" />}
            </button>

            {/* Activation Warning Modal */}
            {showWarning && (
                <div className="agentic-modal-overlay" onClick={() => setShowWarning(false)}>
                    <div className="agentic-modal" onClick={e => e.stopPropagation()}>
                        <div className="agentic-modal-header">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary, #7c3aed)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 2a4 4 0 0 1 4 4c0 1.5-.8 2.8-2 3.5v1.5h-4v-1.5C8.8 8.8 8 7.5 8 6a4 4 0 0 1 4-4z"/>
                                <path d="M10 13h4v2a2 2 0 0 1-4 0v-2z"/>
                                <path d="M12 18v4"/>
                            </svg>
                            <h3>Enable Agentic Mode</h3>
                        </div>

                        <div className="agentic-modal-body">
                            <p className="agentic-modal-desc">
                                Agentic Mode lets the AI <strong>iterate autonomously</strong> — analyzing results, 
                                refining outputs, and chaining operations until the task is complete.
                            </p>

                            <div className="agentic-features">
                                <div className="agentic-feature">
                                    <span className="agentic-feature-icon">1</span>
                                    <span>Auto-iterate until satisfied</span>
                                </div>
                                <div className="agentic-feature">
                                    <span className="agentic-feature-icon">2</span>
                                    <span>Analyze generated images</span>
                                </div>
                                <div className="agentic-feature">
                                    <span className="agentic-feature-icon">3</span>
                                    <span>Chain text, image, refine</span>
                                </div>
                                <div className="agentic-feature">
                                    <span className="agentic-feature-icon">4</span>
                                    <span>Multi-step content pipelines</span>
                                </div>
                            </div>

                            <div className="agentic-warning-box">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#eab308" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink: 0, marginTop: 2}}>
                                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                                    <line x1="12" y1="9" x2="12" y2="13"/>
                                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                                </svg>
                                <span>
                                    <strong>Token Warning:</strong> Agentic mode uses 3-10x more tokens per task 
                                    depending on complexity and model. Monitor your API usage.
                                </span>
                            </div>
                        </div>

                        <div className="agentic-modal-actions">
                            <button className="agentic-btn-cancel" onClick={() => setShowWarning(false)}>
                                Stay in Chat Mode
                            </button>
                            <button className="agentic-btn-activate" onClick={handleConfirmActivate}>
                                Activate Agentic Mode
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Can't Disable Modal */}
            {showCantDisable && (
                <div className="agentic-modal-overlay" onClick={() => setShowCantDisable(false)}>
                    <div className="agentic-modal agentic-modal-small" onClick={e => e.stopPropagation()}>
                        <div className="agentic-modal-header">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary, #7c3aed)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                            </svg>
                            <h3>Can't Disable</h3>
                        </div>
                        <div className="agentic-modal-body">
                            <p className="agentic-modal-desc">
                                Agentic Mode can't be turned off while a task is running. 
                                Wait for the current operation to complete, or stop it first.
                            </p>
                        </div>
                        <div className="agentic-modal-actions">
                            <button className="agentic-btn-activate" onClick={() => setShowCantDisable(false)}>
                                Got it
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

export default AgenticToggle;
