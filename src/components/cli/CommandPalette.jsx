/**
 * CommandPalette — keyboard-first action launcher.
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import Modal from '../common/Modal';
import Icon, { ICONS } from '../icons/Icon';
import './CommandPalette.css';

function scoreCommand(command, query) {
    const q = query.trim().toLowerCase();
    if (!q) return 1;
    const label = String(command.label || '').toLowerCase();
    const id = String(command.id || '').toLowerCase();
    const keywords = (command.keywords || []).join(' ').toLowerCase();
    if (label.startsWith(q)) return 100;
    if (id.startsWith(q)) return 90;
    if (label.includes(q)) return 70;
    if (keywords.includes(q)) return 60;
    const words = q.split(/\s+/).filter(Boolean);
    if (words.every((word) => `${label} ${id} ${keywords}`.includes(word))) return 40;
    return 0;
}

function CommandPalette({ isOpen, onClose, commands = [] }) {
    const { t, language, changeLanguage } = useLanguage();
    const { toggleTheme } = useTheme();
    const navigate = useNavigate();
    const [query, setQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef(null);

    const defaultCommands = useMemo(() => [
        { id: 'new-project', category: 'create', label: t('cli.newProject'), keywords: ['new', 'project', 'create'], action: () => navigate('/') },
        { id: 'open-settings', category: 'navigation', label: t('cli.openSettings'), shortcut: 'Ctrl/⌘ ,', keywords: ['settings', 'provider', 'models', 'config'], action: () => navigate('/settings') },
        { id: 'toggle-theme', category: 'appearance', label: t('cli.toggleTheme'), keywords: ['theme', 'dark', 'light'], action: () => toggleTheme() },
        { id: 'switch-language', category: 'appearance', label: language === 'es' ? t('cli.switchToEnglish') : t('cli.switchToSpanish'), keywords: ['language', 'idioma', 'english', 'spanish'], action: () => changeLanguage(language === 'es' ? 'en' : 'es') },
        { id: 'open-cli', category: 'navigation', label: t('cli.title'), shortcut: 'Ctrl/⌘ `', keywords: ['cli', 'terminal', 'command'], action: () => navigate('/cli') }
    ], [t, language, changeLanguage, toggleTheme, navigate]);

    const allCommands = useMemo(() => {
        const unique = new Map();
        [...defaultCommands, ...commands].forEach((command) => unique.set(command.id, command));
        return [...unique.values()]
            .map((command) => ({ command, score: scoreCommand(command, query) }))
            .filter((item) => item.score > 0)
            .sort((left, right) => right.score - left.score || String(left.command.category).localeCompare(String(right.command.category)))
            .map((item) => item.command);
    }, [defaultCommands, commands, query]);

    useEffect(() => {
        if (!isOpen) return;
        setQuery('');
        setSelectedIndex(0);
        window.requestAnimationFrame(() => inputRef.current?.focus());
    }, [isOpen]);

    useEffect(() => { setSelectedIndex(0); }, [query]);

    const execute = (command) => {
        if (!command) return;
        command.action();
        onClose();
    };

    const handleKeyDown = (event) => {
        if (event.key === 'ArrowDown' && allCommands.length) {
            event.preventDefault();
            setSelectedIndex((value) => (value + 1) % allCommands.length);
        } else if (event.key === 'ArrowUp' && allCommands.length) {
            event.preventDefault();
            setSelectedIndex((value) => (value - 1 + allCommands.length) % allCommands.length);
        } else if (event.key === 'Enter') {
            event.preventDefault();
            execute(allCommands[selectedIndex]);
        } else if (event.key === 'Escape') onClose();
    };

    let previousCategory = null;
    return (
        <Modal isOpen={isOpen} onClose={onClose} title={t('cli.title')} className="oc-command-palette-modal">
            <div className="oc-command-palette">
                <div className="oc-command-palette-input-wrap">
                    <Icon src={ICONS.SEARCH} size="sm" alt="" />
                    <input
                        ref={inputRef}
                        type="text"
                        className="oc-command-palette-input"
                        placeholder={t('cli.placeholder')}
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        onKeyDown={handleKeyDown}
                        role="combobox"
                        aria-expanded="true"
                        aria-controls="oc-command-palette-list"
                        aria-autocomplete="list"
                    />
                </div>
                <div id="oc-command-palette-list" className="oc-command-palette-list" role="listbox">
                    {allCommands.length === 0 && <div className="oc-command-palette-empty">{t('cli.noResults')}</div>}
                    {allCommands.map((command, index) => {
                        const showCategory = command.category && command.category !== previousCategory;
                        previousCategory = command.category;
                        return (
                            <div key={command.id} className="oc-command-palette-entry">
                                {showCategory && <div className="oc-command-palette-category">{t(`cliUx.category.${command.category}`)}</div>}
                                <button
                                    type="button"
                                    role="option"
                                    aria-selected={index === selectedIndex}
                                    className={`oc-command-palette-item ${index === selectedIndex ? 'selected' : ''}`}
                                    onClick={() => execute(command)}
                                    onMouseEnter={() => setSelectedIndex(index)}
                                >
                                    <span className="oc-command-palette-label">{command.label}</span>
                                    {command.shortcut && <span className="oc-command-palette-shortcut">{command.shortcut}</span>}
                                </button>
                            </div>
                        );
                    })}
                </div>
                <div className="oc-command-palette-footer">Ctrl/⌘ K · ↑↓ · Enter · Esc</div>
            </div>
        </Modal>
    );
}

export default CommandPalette;
