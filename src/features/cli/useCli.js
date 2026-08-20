/**
 * useCli — Browser CLI input, history, suggestions and execution.
 */
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../context/LanguageContext';
import { manager, HOOKS } from '../../plugins';
import { getActiveTextModel, getActiveImageModel, getActiveVisionModel } from '../../services/ai';
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
    try { localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(items.slice(-MAX_HISTORY))); } catch { /* ignore */ }
}

export function useCli() {
    const navigate = useNavigate();
    const { toggleTheme, setTheme } = useTheme();
    const { t, language, changeLanguage } = useLanguage();
    const [input, setInputState] = useState('');
    const [lines, setLines] = useState([
        { type: 'banner', message: t('cli.banner') },
        { type: 'info', message: t('cli.helpHint') }
    ]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const [suggestions, setSuggestions] = useState([]);
    const [suggestionIndex, setSuggestionIndex] = useState(0);
    const inputRef = useRef(null);

    const engine = useMemo(() => {
        const context = { navigate, toggleTheme, setTheme, language, changeLanguage, t };
        const instance = new CliEngine(context);
        createBuiltinCommands(context).forEach((command) => instance.register(command));
        const pluginCommands = manager.runHookSync ? manager.runHookSync(HOOKS.CLI_COMMAND, []) : [];
        pluginCommands.forEach((command) => instance.register(command));
        return instance;
    }, [navigate, toggleTheme, setTheme, language, changeLanguage, t]);

    const refreshSuggestions = useCallback((value) => {
        const trimmed = value.trimStart();
        if (!trimmed) {
            setSuggestions([]);
            return;
        }
        const matches = engine.autocomplete(value).slice(0, 8);
        const exactCommand = engine.commands.has(trimmed.split(/\s+/)[0]);
        if (exactCommand && !value.endsWith(' ') && !value.includes(' ')) setSuggestions([]);
        else setSuggestions(matches);
        setSuggestionIndex(0);
    }, [engine]);

    const setInput = useCallback((value) => {
        setInputState(value);
        refreshSuggestions(value);
    }, [refreshSuggestions]);

    const appendLine = useCallback((line) => setLines((previous) => [...previous, line]), []);

    const execute = useCallback(async () => {
        const raw = input.trim();
        if (!raw) return;
        appendLine({ type: 'command', message: `$ ${raw}` });
        setInputState('');
        setSuggestions([]);
        setHistoryIndex(-1);
        const result = await engine.execute(raw);
        if (result.type === 'clear') setLines([]);
        else appendLine(result);
        const stored = loadStoredHistory();
        stored.push(raw);
        saveStoredHistory(stored);
    }, [input, engine, appendLine]);

    const selectSuggestion = useCallback((suggestion) => {
        if (!suggestion) return;
        const parsed = engine.parse(input);
        if (!parsed.command || !input.includes(' ')) setInput(`${suggestion} `);
        else {
            const head = input.slice(0, input.lastIndexOf(' ') + 1);
            setInput(`${head}${suggestion} `);
        }
        setSuggestions([]);
        inputRef.current?.focus();
    }, [engine, input, setInput]);

    const navigateHistory = useCallback((direction) => {
        const stored = loadStoredHistory();
        if (!stored.length) return;
        const nextIndex = historyIndex + direction;
        if (nextIndex < -1 || nextIndex >= stored.length) return;
        setHistoryIndex(nextIndex);
        const value = nextIndex === -1 ? '' : stored[stored.length - 1 - nextIndex];
        setInputState(value);
        setSuggestions([]);
    }, [historyIndex]);

    const handleKeyDown = useCallback((event) => {
        if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && suggestions.length > 0) {
            event.preventDefault();
            const delta = event.key === 'ArrowDown' ? 1 : -1;
            setSuggestionIndex((current) => (current + delta + suggestions.length) % suggestions.length);
            return;
        }
        if (event.key === 'Escape' && suggestions.length > 0) {
            event.preventDefault();
            setSuggestions([]);
            return;
        }
        if (event.key === 'Tab' && suggestions.length > 0) {
            event.preventDefault();
            selectSuggestion(suggestions[suggestionIndex] || suggestions[0]);
            return;
        }
        if (event.key === 'Enter') {
            event.preventDefault();
            execute();
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            navigateHistory(1);
        } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            navigateHistory(-1);
        }
    }, [execute, navigateHistory, selectSuggestion, suggestionIndex, suggestions]);

    useEffect(() => { inputRef.current?.focus(); }, []);

    const context = {
        textModel: getActiveTextModel(),
        visionModel: getActiveVisionModel(),
        imageModel: getActiveImageModel()
    };

    return {
        input,
        setInput,
        lines,
        inputRef,
        handleKeyDown,
        execute,
        suggestions,
        suggestionIndex,
        selectSuggestion,
        context
    };
}
