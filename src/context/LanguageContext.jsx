/**
 * Language Context
 * OpenContent IDE
 * 
 * Manages i18n language state
 */

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { STORAGE_KEYS, LANGUAGES } from '../config/constants';
import { t, getSection, getLanguages, getBrowserLanguage } from '../i18n';

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
    const [language, setLanguage] = useState(() => {
        const saved = localStorage.getItem(STORAGE_KEYS.LANGUAGE);
        return saved || getBrowserLanguage();
    });

    useEffect(() => {
        localStorage.setItem(STORAGE_KEYS.LANGUAGE, language);
        document.documentElement.setAttribute('lang', language);
    }, [language]);

    const translate = useCallback((key) => {
        return t(key, language);
    }, [language]);

    const getSectionTranslations = useCallback((section) => {
        return getSection(section, language);
    }, [language]);

    const changeLanguage = (lang) => {
        if (Object.values(LANGUAGES).includes(lang)) {
            setLanguage(lang);
        }
    };

    const value = {
        language,
        languages: getLanguages(),
        t: translate,
        getSection: getSectionTranslations,
        changeLanguage,
        isSpanish: language === LANGUAGES.ES,
        isEnglish: language === LANGUAGES.EN
    };

    return (
        <LanguageContext.Provider value={value}>
            {children}
        </LanguageContext.Provider>
    );
}

export function useLanguage() {
    const context = useContext(LanguageContext);
    if (!context) {
        throw new Error('useLanguage must be used within a LanguageProvider');
    }
    return context;
}

export default LanguageContext;
