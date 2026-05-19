/**
 * i18n - Internationalization System
 * OpenContent IDE
 * 
 * Simple translation system for ES/EN
 */

import es from './es.json';
import en from './en.json';

const translations = { es, en };

/**
 * Get a nested translation value by dot notation key
 * @param {string} key - Dot notation key (e.g., 'landing.placeholder')
 * @param {string} lang - Language code ('es' or 'en')
 * @returns {string} - Translated string or key if not found
 */
export function t(key, lang = 'es') {
    const keys = key.split('.');
    let value = translations[lang] || translations.es;

    for (const k of keys) {
        if (value && typeof value === 'object' && k in value) {
            value = value[k];
        } else {
            // Return key if translation not found
            return key;
        }
    }

    return typeof value === 'string' ? value : key;
}

/**
 * Get all translations for a specific section
 * @param {string} section - Section name (e.g., 'landing')
 * @param {string} lang - Language code
 * @returns {object} - Section translations
 */
export function getSection(section, lang = 'es') {
    const langData = translations[lang] || translations.es;
    return langData[section] || {};
}

/**
 * Get available languages
 * @returns {Array} - Array of language objects
 */
export function getLanguages() {
    return [
        { code: 'es', name: 'Espanol', flag: 'ES' },
        { code: 'en', name: 'English', flag: 'EN' }
    ];
}

/**
 * Get browser's preferred language (fallback to 'es')
 * @returns {string} - Language code
 */
export function getBrowserLanguage() {
    const browserLang = navigator.language?.split('-')[0];
    return translations[browserLang] ? browserLang : 'es';
}

export default { t, getSection, getLanguages, getBrowserLanguage };
