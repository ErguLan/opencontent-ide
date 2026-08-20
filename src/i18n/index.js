/**
 * i18n - Internationalization System
 * OpenContent IDE
 */
import es from './es.json';
import en from './en.json';
import artifactTranslations from './artifactTranslations.js';

const translations = {
    es: { ...es, ...artifactTranslations.es },
    en: { ...en, ...artifactTranslations.en }
};
let currentLanguage = 'es';
export function setLanguage(lang) { if (translations[lang]) currentLanguage = lang; }
export function getLanguage() { return currentLanguage; }
function interpolate(value, vars = {}) { if (typeof value !== 'string') return value; return value.replace(/\{(\s*\w+\s*)\}/g, (_, key) => { const trimmed = key.trim(); return trimmed in vars ? String(vars[trimmed]) : `{${trimmed}}`; }); }
export function t(key, vars, lang = currentLanguage) { const keys = key.split('.'); let value = translations[lang] || translations.es; for (const k of keys) { if (value && typeof value === 'object' && k in value) value = value[k]; else return key; } if (typeof value !== 'string') return key; return vars ? interpolate(value, vars) : value; }
export function getSection(section, lang = currentLanguage) { const langData = translations[lang] || translations.es; return langData[section] || {}; }
export function getLanguages() { return [{ code: 'es', name: 'Espanol', flag: 'ES' }, { code: 'en', name: 'English', flag: 'EN' }]; }
export function getBrowserLanguage() { const browserLang = navigator.language?.split('-')[0]; return translations[browserLang] ? browserLang : 'es'; }
export default { t, setLanguage, getLanguage, getSection, getLanguages, getBrowserLanguage };
