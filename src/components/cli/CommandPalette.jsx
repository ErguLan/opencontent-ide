/**
 * CommandPalette — Mini CLI inside OpenContent IDE
 *
 * Provides keyboard-driven commands for common actions.
 * Triggered by a button or Ctrl/Cmd+K.
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import Modal from '../common/Modal';
import Icon, { ICONS } from '../icons/Icon';
import './CommandPalette.css';

function CommandPalette({ isOpen, onClose, commands = [] }) {
    const { t, language, changeLanguage } = useLanguage();
    const { toggleTheme } = useTheme();
    const navigate = useNavigate();
    const [query, setQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef(null);

    const defaultCommands = useMemo(() => [
        {
            id: 'new-project',
            label: t('cli.newProject'),
            shortcut: 'N',
            action: () => navigate('/')
        },
        {
            id: 'open-settings',
            label: t('cli.openSettings'),
            shortcut: ',',
            action: () => navigate('/settings')
        },
        {
            id: 'toggle-theme',
            label: t('cli.toggleTheme'),
            shortcut: 'T',
            action: () => toggleTheme()
        },
        {
            id: 'switch-language',
            label: language === 'es' ? t('cli.switchToEnglish') : t('cli.switchToSpanish'),
            shortcut: 'L',
            action: () => changeLanguage(language === 'es' ? 'en' : 'es')
        },
        {
            id: 'open-cli',
            label: 'Open CLI',
            shortcut: 'C',
            action: () => navigate('/cli')
        }
    ], [t, language, changeLanguage, toggleTheme, navigate]);

    const allCommands = useMemo(() => {
        const combined = [...defaultCommands, ...commands];
        const q = query.trim().toLowerCase();
        if (!q) return combined;
        return combined.filter(
            (cmd) => cmd.label.toLowerCase().includes(q) || cmd.id.toLowerCase().includes(q)
        );
    }, [defaultCommands, commands, query]);

    useEffect(() => {
        if (isOpen) {
            setQuery('');
            setSelectedIndex(0);
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [isOpen]);

    useEffect(() => {
        setSelectedIndex(0);
    }, [query]);

    const handleKeyDown = (e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex((prev) => (prev + 1) % allCommands.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex((prev) => (prev - 1 + allCommands.length) % allCommands.length);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const cmd = allCommands[selectedIndex];
            if (cmd) {
                cmd.action();
                onClose();
            }
        } else if (e.key === 'Escape') {
            onClose();
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={t('cli.title')} className="oc-command-palette-modal">
            <div className="oc-command-palette">
                <div className="oc-command-palette-input-wrap">
                    <Icon src={ICONS.SEARCH} size="sm" />
                    <input
                        ref={inputRef}
                        type="text"
                        className="oc-command-palette-input"
                        placeholder={t('cli.placeholder')}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                    />
                </div>
                <div className="oc-command-palette-list">
                    {allCommands.length === 0 && (
                        <div className="oc-command-palette-empty">{t('cli.noResults')}</div>
                    )}
                    {allCommands.map((cmd, index) => (
                        <button
                            key={cmd.id}
                            type="button"
                            className={`oc-command-palette-item ${index === selectedIndex ? 'selected' : ''}`}
                            onClick={() => { cmd.action(); onClose(); }}
                            onMouseEnter={() => setSelectedIndex(index)}
                        >
                            <span className="oc-command-palette-label">{cmd.label}</span>
                            {cmd.shortcut && (
                                <span className="oc-command-palette-shortcut">{cmd.shortcut}</span>
                            )}
                        </button>
                    ))}
                </div>
            </div>
        </Modal>
    );
}

export default CommandPalette;
