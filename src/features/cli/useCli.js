/**
 * useCli — Hook for managing CLI input, history, and execution.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../context/LanguageContext';
import { manager, HOOKS } from '../../plugins';
import { CliEngine } from './CliEngine';
import { createBuiltinCommands } from './commands';

const HISTORY_STORAGE_KEY = 'oc_cli_history';
const MAX_HISTORY = 100;

function loadStoredHistory() {
    try {
        const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function saveStoredHistory(items) {
    try {
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(items.slice(-MAX_HISTORY)));
    } catch {
        // ignore
    }
}

export function useCli() {
    const navigate = useNavigate();
    const { toggleTheme, setTheme } = useTheme();
    const { t, language, changeLanguage } = useLanguage();

    const [input, setInput] = useState('');
    const [lines, setLines] = useState([
        { type: 'banner', message: t('cli.banner') },
        { type: 'info', message: t('cli.helpHint') }
    ]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const inputRef = useRef(null);

    const engine = useMemo(() => {
        const context = { navigate, toggleTheme, setTheme, language, changeLanguage, t };
        const eng = new CliEngine(context);
        createBuiltinCommands(context).forEach((cmd) => eng.register(cmd));

        const pluginCommands = manager.runHookSync ? manager.runHookSync(HOOKS.CLI_COMMAND, []) : [];
        pluginCommands.forEach((cmd) => eng.register(cmd));
        return eng;
    }, [navigate, toggleTheme, setTheme, language, changeLanguage, t]);

    const appendLine = useCallback((line) => {
        setLines((prev) => [...prev, line]);
    }, []);

    const execute = useCallback(async () => {
        const raw = input.trim();
        if (!raw) return;

        appendLine({ type: 'command', message: `$ ${raw}` });
        setInput('');
        setHistoryIndex(-1);

        const result = await engine.execute(raw);
        if (result.type === 'clear') {
            setLines([]);
        } else {
            appendLine(result);
        }

        const stored = loadStoredHistory();
        stored.push(raw);
        saveStoredHistory(stored);
    }, [input, engine, appendLine]);

    const navigateHistory = useCallback((direction) => {
        const stored = loadStoredHistory();
        if (stored.length === 0) return;
        const nextIndex = historyIndex + direction;
        if (nextIndex < -1 || nextIndex >= stored.length) return;
        setHistoryIndex(nextIndex);
        setInput(nextIndex === -1 ? '' : stored[stored.length - 1 - nextIndex]);
    }, [historyIndex]);

    const handleKeyDown = useCallback((e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            execute();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            navigateHistory(1);
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            navigateHistory(-1);
        } else if (e.key === 'Tab') {
            e.preventDefault();
            const suggestions = engine.autocomplete(input);
            if (suggestions.length === 1) {
                setInput(`${suggestions[0]} `);
            } else if (suggestions.length > 0) {
                appendLine({ type: 'info', message: suggestions.join('  ') });
            }
        }
    }, [execute, navigateHistory, engine, input, appendLine]);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    return {
        input,
        setInput,
        lines,
        inputRef,
        handleKeyDown,
        execute
    };
}
