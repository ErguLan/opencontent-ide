/**
 * QuickPrompts — Template suggestions for empty workspace
 * OpenContent IDE
 * 
 * Shows animated prompt cards when the workspace has no chat history.
 * Clicking a card fills the chat input.
 */

import { useState, useEffect } from 'react';
import { useLanguage } from '../../../context/LanguageContext';
import { getQuickPrompts, getAllPrompts } from '../../../data/quickPrompts';

function QuickPrompts({ language = 'en', onSelect, hasApiKeys = true }) {
    const { t } = useLanguage();
    const [prompts, setPrompts] = useState([]);
    const [showAll, setShowAll] = useState(false);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        setPrompts(getQuickPrompts(language, showAll ? 10 : 3));
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
                <span className="quick-prompts-title">{t('landing.startWithIdea')}</span>
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
                        <span className="quick-prompt-label">{p.label}</span>
                    </button>
                ))}
            </div>

            {!showAll && (
                <button className="quick-prompts-more" onClick={handleShowAll}>
                    {t('landing.browseAllTemplates')}
                </button>
            )}
        </div>
    );
}

export default QuickPrompts;
