/**
 * QuickPrompts — Template suggestions for empty workspace
 * OpenContent IDE
 * 
 * Shows animated prompt cards when the workspace has no chat history.
 * Clicking a card fills the chat input.
 */

import { useState, useEffect } from 'react';
import { getQuickPrompts, getAllPrompts } from '../../../data/quickPrompts';

function QuickPrompts({ language = 'en', onSelect, hasApiKeys = true }) {
    const [prompts, setPrompts] = useState([]);
    const [showAll, setShowAll] = useState(false);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        // Show 3 random on first render, more in editor
        setPrompts(getQuickPrompts(language, showAll ? 10 : 3));
        // Stagger animation
        const timer = setTimeout(() => setVisible(true), 100);
        return () => clearTimeout(timer);
    }, [language, showAll]);

    const handleShowAll = () => {
        setShowAll(true);
        setPrompts(getAllPrompts(language));
    };

    if (!hasApiKeys) return null;

    return (
        <div className={`quick-prompts-container ${visible ? 'quick-prompts-visible' : ''}`}>
            <div className="quick-prompts-header">
                <span className="quick-prompts-title">
                    {language === 'es' ? 'Empieza con una idea' : 'Start with an idea'}
                </span>
            </div>

            <div className={`quick-prompts-grid ${showAll ? 'quick-prompts-grid-expanded' : ''}`}>
                {prompts.map((p, i) => (
                    <button
                        key={`${p.label}-${i}`}
                        className="quick-prompt-card"
                        onClick={() => onSelect(p.prompt)}
                        style={{ animationDelay: `${i * 80}ms` }}
                        title={p.prompt}
                    >
                        <span className="quick-prompt-emoji">{p.emoji}</span>
                        <span className="quick-prompt-label">{p.label}</span>
                    </button>
                ))}
            </div>

            {!showAll && (
                <button className="quick-prompts-more" onClick={handleShowAll}>
                    {language === 'es' ? 'Ver más templates' : 'Browse all templates'} →
                </button>
            )}
        </div>
    );
}

export default QuickPrompts;
