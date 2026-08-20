/**
 * i18n - Internationalization System
 * OpenContent IDE
 */
import es from './es.json';
import en from './en.json';
import artifactTranslations from './artifactTranslations.js';
import uxTranslations from './uxTranslations.js';

function deepMerge(base, ...layers) {
    const output = { ...base };
    for (const layer of layers) {
        if (!layer || typeof layer !== 'object') continue;
        for (const [key, value] of Object.entries(layer)) {
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                output[key] = deepMerge(output[key] && typeof output[key] === 'object' ? output[key] : {}, value);
            } else {
                output[key] = value;
            }
        }
    }
    return output;
}

const translations = {
    es: deepMerge(es, artifactTranslations.es, uxTranslations.es),
    en: deepMerge(en, artifactTranslations.en, uxTranslations.en)
};

let currentLanguage = 'es';
export function setLanguage(lang) { if (translations[lang]) currentLanguage = lang; }
export function getLanguage() { return currentLanguage; }
function interpolate(value, vars = {}) {
    if (typeof value !== 'string') return value;
    return value.replace(/\{(\s*\w+\s*)\}/g, (_, key) => {
        const trimmed = key.trim();
        return trimmed in vars ? String(vars[trimmed]) : `{${trimmed}}`;
    });
}
export function t(key, vars, lang = currentLanguage) {
    const keys = key.split('.');
    let value = translations[lang] || translations.es;
    for (const part of keys) {
        if (value && typeof value === 'object' && part in value) value = value[part];
        else return key;
    }
    if (typeof value !== 'string') return key;
    return vars ? interpolate(value, vars) : value;
}
export function getSection(section, lang = currentLanguage) {
    const langData = translations[lang] || translations.es;
    return langData[section] || {};
}
export function getLanguages() {
    return [{ code: 'es', name: 'Espanol', flag: 'ES' }, { code: 'en', name: 'English', flag: 'EN' }];
}
export function getBrowserLanguage() {
    const browserLang = navigator.language?.split('-')[0];
    return translations[browserLang] ? browserLang : 'es';
}
export default { t, setLanguage, getLanguage, getSection, getLanguages, getBrowserLanguage };
