/**
 * Settings Page
 * OpenContent IDE
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Settings.css';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import Icon, { ICONS } from '../../components/icons/Icon';
import Button from '../../components/common/Button';
import { ROUTES, PLANS, STORAGE_KEYS } from '../../config/constants';

function Settings() {
    const DEFAULT_TIMEOUT_MS = 45000;
    const MIN_TIMEOUT_MS = 10000;
    const MAX_TIMEOUT_MS = 120000;
    const navigate = useNavigate();
    const { t, language, languages, changeLanguage } = useLanguage();
    const { theme, isDark, toggleTheme } = useTheme();
    const { isAuthenticated, profile, logout } = useAuth();
    const [showLastPrompt, setShowLastPrompt] = useState(
        () => localStorage.getItem(STORAGE_KEYS.SHOW_LAST_PROMPT) === 'true'
    );
    const [imageProcessingMode, setImageProcessingMode] = useState(
        () => localStorage.getItem(STORAGE_KEYS.IMAGE_PROCESSING_MODE) || 'smart'
    );
    const [aiTimeoutMs, setAiTimeoutMs] = useState(() => {
        const stored = Number(localStorage.getItem(STORAGE_KEYS.AI_TIMEOUT_MS));
        if (!Number.isFinite(stored)) return DEFAULT_TIMEOUT_MS;
        return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, stored));
    });

    const handleLogout = async () => {
        await logout();
        navigate(ROUTES.LANDING);
    };

    const handleToggleLastPrompt = () => {
        const nextValue = !showLastPrompt;
        setShowLastPrompt(nextValue);
        localStorage.setItem(STORAGE_KEYS.SHOW_LAST_PROMPT, String(nextValue));
    };

    const handleChangeImageProcessingMode = (mode) => {
        setImageProcessingMode(mode);
        localStorage.setItem(STORAGE_KEYS.IMAGE_PROCESSING_MODE, mode);
    };

    const handleTimeoutChange = (value) => {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) {
            setAiTimeoutMs(DEFAULT_TIMEOUT_MS);
            localStorage.setItem(STORAGE_KEYS.AI_TIMEOUT_MS, String(DEFAULT_TIMEOUT_MS));
            return;
        }
        const clamped = Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.round(numeric)));
        setAiTimeoutMs(clamped);
        localStorage.setItem(STORAGE_KEYS.AI_TIMEOUT_MS, String(clamped));
    };

    return (
        <div className="settings-page">
            {/* Header */}
            <header className="settings-header">
                <button className="back-button" onClick={() => navigate(-1)}>
                    <Icon src={ICONS.CLOSE} size="sm" />
                </button>
                <h1 className="settings-title">{t('settings.title')}</h1>
                <div className="header-spacer" />
            </header>

            {/* Content */}
            <main className="settings-content">
                <div className="settings-container">
                    {/* Account Section */}
                    {isAuthenticated && profile && (
                        <section className="settings-section">
                            <h2 className="section-title">{t('settings.account.title')}</h2>

                            <div className="account-card">
                                <div className="account-avatar">
                                    {profile.avatarUrl ? (
                                        <img src={profile.avatarUrl} alt={profile.displayName} />
                                    ) : (
                                        <span>{profile.displayName?.charAt(0) || '?'}</span>
                                    )}
                                </div>

                                <div className="account-info">
                                    <span className="account-name">{profile.displayName}</span>
                                    <span className="account-email">{profile.email}</span>
                                </div>

                                <div className="account-plan">
                                    <span className={`plan-badge ${profile.plan === PLANS.PRO ? 'pro' : ''}`}>
                                        {profile.plan === PLANS.PRO ? t('settings.account.pro') : t('settings.account.free')}
                                    </span>
                                </div>
                            </div>

                            <Button
                                variant="secondary"
                                onClick={handleLogout}
                            >
                                {t('settings.account.logout')}
                            </Button>
                        </section>
                    )}

                    {/* Not logged in */}
                    {!isAuthenticated && (
                        <section className="settings-section">
                            <h2 className="section-title">{t('settings.account.title')}</h2>
                            <p className="section-description">
                                {t('auth.noAccount')}
                            </p>
                            <Button
                                variant="primary"
                                onClick={() => navigate(ROUTES.LOGIN)}
                            >
                                {t('auth.login')}
                            </Button>
                        </section>
                    )}

                    {/* Theme Section */}
                    <section className="settings-section">
                        <h2 className="section-title">{t('settings.theme.title')}</h2>

                        <div className="setting-row">
                            <div className="setting-info">
                                <span className="setting-label">
                                    {isDark ? t('settings.theme.dark') : t('settings.theme.light')}
                                </span>
                            </div>

                            <button
                                className={`theme-toggle ${isDark ? 'dark' : 'light'}`}
                                onClick={toggleTheme}
                            >
                                <span className="toggle-track">
                                    <span className="toggle-thumb" />
                                </span>
                                <Icon
                                    src={ICONS.FOQUITO}
                                    size="xs"
                                    className="toggle-icon"
                                />
                            </button>
                        </div>
                    </section>

                    {/* Language Section */}
                    <section className="settings-section">
                        <h2 className="section-title">{t('settings.language.title')}</h2>

                        <div className="language-options">
                            {languages.map((lang) => (
                                <button
                                    key={lang.code}
                                    className={`language-option ${language === lang.code ? 'active' : ''}`}
                                    onClick={() => changeLanguage(lang.code)}
                                >
                                    <span className="language-flag">{lang.flag}</span>
                                    <span className="language-name">{lang.name}</span>
                                    {language === lang.code && (
                                        <Icon src={ICONS.CHECK} size="sm" className="check-icon" />
                                    )}
                                </button>
                            ))}
                        </div>
                    </section>

                    {/* Workspace Section */}
                    <section className="settings-section">
                        <h2 className="section-title">Workspace</h2>

                        <div className="setting-row">
                            <div className="setting-info">
                                <span className="setting-label">Mostrar ultimo prompt en resultado</span>
                            </div>

                            <button
                                className={`theme-toggle ${showLastPrompt ? 'dark' : 'light'}`}
                                onClick={handleToggleLastPrompt}
                                aria-label="Mostrar u ocultar ultimo prompt"
                            >
                                <span className="toggle-track">
                                    <span className="toggle-thumb" />
                                </span>
                                <Icon
                                    src={ICONS.CONFIG}
                                    size="xs"
                                    className="toggle-icon"
                                />
                            </button>
                        </div>

                        <div className="setting-row setting-row-stacked">
                            <div className="setting-info">
                                <span className="setting-label">Procesamiento de imagen adjunta</span>
                                <span className="setting-description">Define como Agent procesa templates o imagenes que subes al chat.</span>
                            </div>

                            <div className="mode-options">
                                <button
                                    type="button"
                                    className={`mode-option ${imageProcessingMode === 'analysis_send' ? 'active' : ''}`}
                                    onClick={() => handleChangeImageProcessingMode('analysis_send')}
                                >
                                    Analisis + envio
                                </button>
                                <button
                                    type="button"
                                    className={`mode-option ${imageProcessingMode === 'send_only' ? 'active' : ''}`}
                                    onClick={() => handleChangeImageProcessingMode('send_only')}
                                >
                                    Solo envio
                                </button>
                                <button
                                    type="button"
                                    className={`mode-option ${imageProcessingMode === 'smart' ? 'active' : ''}`}
                                    onClick={() => handleChangeImageProcessingMode('smart')}
                                >
                                    Modelo inteligente
                                </button>
                            </div>
                        </div>

                        <div className="setting-row setting-row-stacked">
                            <div className="setting-info">
                                <span className="setting-label">Timeout de IA</span>
                                <span className="setting-description">Tiempo maximo de espera antes de cancelar una generacion (10s a 120s).</span>
                            </div>

                            <div className="timeout-row">
                                <input
                                    type="number"
                                    className="timeout-input"
                                    min={MIN_TIMEOUT_MS}
                                    max={MAX_TIMEOUT_MS}
                                    step={1000}
                                    value={aiTimeoutMs}
                                    onChange={(e) => handleTimeoutChange(e.target.value)}
                                    aria-label="Timeout de IA en milisegundos"
                                />
                                <span className="timeout-unit">ms</span>
                                <span className="timeout-preview">{Math.round(aiTimeoutMs / 1000)}s</span>
                            </div>
                        </div>
                    </section>

                    {/* About Section */}
                    <section className="settings-section">
                        <h2 className="section-title">About</h2>
                        <div className="about-info">
                            <div className="about-logo">
                                <Icon src={ICONS.LOGO} size={48} />
                            </div>
                            <span className="about-name">OpenContent IDE</span>
                            <span className="about-version">v1.0.0</span>
                            <span className="about-powered">Powered by Agent</span>
                        </div>
                    </section>
                </div>
            </main>
        </div>
    );
}

export default Settings;
