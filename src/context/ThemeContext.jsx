/**
 * Theme Context
 * OpenContent IDE
 */

import { createContext, useContext, useState, useEffect } from 'react';
import { STORAGE_KEYS, THEMES } from '../config/constants';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
    const [theme, setTheme] = useState(() => {
        return localStorage.getItem(STORAGE_KEYS.THEME) || THEMES.DARK;
    });

    const isDark = theme === THEMES.DARK;

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem(STORAGE_KEYS.THEME, theme);
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prev => prev === THEMES.DARK ? THEMES.LIGHT : THEMES.DARK);
    };

    return (
        <ThemeContext.Provider value={{ theme, isDark, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (!context) throw new Error('useTheme must be used within ThemeProvider');
    return context;
}

export default ThemeContext;
