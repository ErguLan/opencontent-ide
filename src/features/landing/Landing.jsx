/**
 * Landing Page
 * OpenContent IDE
 *
 * Main entry point - centered input with direct-to-action philosophy.
 */

import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Landing.css';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import Icon, { ICONS } from '../../components/icons/Icon';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import Starfield from '../../components/effects/Starfield';
import ModelSelector from '../../components/model/ModelSelector';
import { ROUTES, STORAGE_KEYS } from '../../config/constants';
import { getActiveTextModel, getActiveVisionModel, getActiveImageModel, isAIConfigured } from '../../services/ai';
import QuickPrompts from '../workspace/components/QuickPrompts';
import { syncBrowserClientConfig } from '../../services/externalSessions';
import '../workspace/components/FeatureComponents.css';

function Landing() {
    const navigate = useNavigate();
    const { t, language } = useLanguage();
    const { isDark, toggleTheme } = useTheme();
    const { isAuthenticated, profile } = useAuth();

    const [prompt, setPrompt] = useState('');
    const [isTransitioning, setIsTransitioning] = useState(false);
    const [placeholderIndex, setPlaceholderIndex] = useState(0);
    const [displayPlaceholder, setDisplayPlaceholder] = useState('');
    const [isTyping, setIsTyping] = useState(true);
    const [showModelModal, setShowModelModal] = useState(false);
    const [selectedTextModel, setSelectedTextModel] = useState(() => getActiveTextModel());
    const [selectedVisionModel, setSelectedVisionModel] = useState(() => getActiveVisionModel());
    const [selectedImageModel, setSelectedImageModel] = useState(() => getActiveImageModel());

    const inputRef = useRef(null);

    useEffect(() => {
        const placeholderHints = t('landing.placeholderHints') || [];
        if (!Array.isArray(placeholderHints) || placeholderHints.length === 0) return;
        const currentHint = placeholderHints[placeholderIndex];
        let charIndex = 0;
        let typeInterval;
        let pauseTimeout;
        if (isTyping) {
            typeInterval = setInterval(() => {
                if (charIndex <= currentHint.length) {
                    setDisplayPlaceholder(currentHint.substring(0, charIndex));
                    charIndex++;
                } else {
                    clearInterval(typeInterval);
                    pauseTimeout = setTimeout(() => setIsTyping(false), 2000);
                }
            }, 50);
        } else {
            let eraseIndex = currentHint.length;
            typeInterval = setInterval(() => {
                if (eraseIndex >= 0) {
                    setDisplayPlaceholder(currentHint.substring(0, eraseIndex));
                    eraseIndex--;
                } else {
                    clearInterval(typeInterval);
                    setPlaceholderIndex((prev) => (prev + 1) % placeholderHints.length);
                    setIsTyping(true);
                }
            }, 30);
        }
        return () => {
            clearInterval(typeInterval);
            clearTimeout(pauseTimeout);
        };
    }, [placeholderIndex, isTyping, t]);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    useEffect(() => {
        syncBrowserClientConfig({ activeTextModel: selectedTextModel, activeVisionModel: selectedVisionModel, activeImageModel: selectedImageModel });
    }, [selectedTextModel, selectedVisionModel, selectedImageModel]);

    useEffect(() => {
        const timer = window.setInterval(() => {
            syncBrowserClientConfig({ activeTextModel: selectedTextModel, activeVisionModel: selectedVisionModel, activeImageModel: selectedImageModel });
        }, 5000);
        return () => window.clearInterval(timer);
    }, [selectedTextModel, selectedVisionModel, selectedImageModel]);

    const handleSubmit = (e) => {
        e?.preventDefault();
        const trimmedPrompt = prompt.trim();
        if (!trimmedPrompt || isTransitioning) return;
        setIsTransitioning(true);
        setTimeout(() => {
            navigate(ROUTES.WORKSPACE, { state: { initialPrompt: trimmedPrompt } });
        }, 800);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            handleSubmit(e);
        }
    };

    const handleSaveModelSelection = (textModel, imageModel, visionModel) => {
        setSelectedTextModel(textModel);
        setSelectedVisionModel(visionModel);
        setSelectedImageModel(imageModel);
        localStorage.setItem(STORAGE_KEYS.SELECTED_TEXT_MODEL, textModel);
        localStorage.setItem(STORAGE_KEYS.SELECTED_VISION_MODEL, visionModel || '');
        localStorage.setItem(STORAGE_KEYS.SELECTED_IMAGE_MODEL, imageModel);
        setShowModelModal(false);
    };

    return (
        <div className={`landing ${isTransitioning ? 'landing-transitioning' : ''}`}>
            <Starfield starCount={200} />

            <header className="landing-header">
                <div className="header-left">
                    <button className="icon-button" onClick={toggleTheme} title={isDark ? t('settings.theme.light') : t('settings.theme.dark')}>
                        <Icon src={ICONS.FOQUITO} size="sm" animation="pop" />
                    </button>
                </div>
                <div className="header-right">
                    <button className="icon-button model-shortcut-button" onClick={() => setShowModelModal(true)} title={t('workspace.model.change')}>
                        <Icon src={ICONS.CONFIG} size="sm" alt={t('workspace.model.short')} animation="spin" />
                    </button>
                    <button className="icon-button editor-shortcut-button" onClick={() => navigate(ROUTES.WORKSPACE)} title={t('workspace.editorShortcut')}>
                        <Icon src={ICONS.EDIT_PEN} />
                    </button>
                    {isAuthenticated ? (
                        <button className="user-avatar" onClick={() => navigate(ROUTES.SETTINGS)}>
                            {profile?.avatarUrl ? (
                                <img src={profile.avatarUrl} alt={profile.displayName} />
                            ) : (
                                <span>{profile?.displayName?.charAt(0) || '?'}</span>
                            )}
                        </button>
                    ) : (
                        <Button variant="secondary" size="sm" onClick={() => navigate(ROUTES.LOGIN)}>
                            {t('auth.login')}
                        </Button>
                    )}
                </div>
            </header>

            <main className="landing-main">
                <div className={`landing-content ${isTransitioning ? 'content-transitioning' : ''}`}>
                    <div className="landing-logo">
                        <Icon src={ICONS.LOGO} size={100} alt="OpenContent IDE" className="logo-icon" />
                    </div>

                    {isAuthenticated && profile?.displayName && (
                        <p className="landing-greeting">
                            {t('landing.greeting')}, <strong>{profile.displayName.split(' ')[0]}</strong>
                        </p>
                    )}

                    <form className="landing-form" onSubmit={handleSubmit}>
                        <div className="landing-input-wrapper">
                            <input
                                ref={inputRef}
                                type="text"
                                className="landing-input"
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder={displayPlaceholder || t('landing.placeholder')}
                                autoComplete="off"
                                autoFocus
                            />
                            <button type="submit" className={`landing-submit ${prompt.trim() ? 'visible' : ''}`} disabled={!prompt.trim()}>
                                <Icon src={ICONS.EXECUTE} size="md" animation="pop" />
                            </button>
                        </div>
                    </form>

                    {!isAIConfigured() && (
                        <button className="pro-upgrade-cta" onClick={() => navigate(ROUTES.SETTINGS)} title={t('settings.title')}>
                            <Icon src={ICONS.SETTINGS} size={18} />
                            <span>{t('landing.setupApiKeys')}</span>
                        </button>
                    )}

                    {isAIConfigured() && (
                        <QuickPrompts
                            language={language}
                            onSelect={(p) => { setPrompt(p); inputRef.current?.focus(); }}
                            hasApiKeys={true}
                        />
                    )}
                </div>
            </main>

            <footer className="landing-footer">
                <button className="icon-button" onClick={() => navigate(ROUTES.SETTINGS)} title={t('settings.title')}>
                    <Icon src={ICONS.SETTINGS} size="sm" animation="spin" />
                </button>
            </footer>

            <Modal
                isOpen={showModelModal}
                onClose={() => setShowModelModal(false)}
                title={t('workspace.model.title')}
                className="modal-model"
                footer={null}
            >
                <ModelSelector
                    textModel={selectedTextModel}
                    visionModel={selectedVisionModel}
                    imageModel={selectedImageModel}
                    onSave={handleSaveModelSelection}
                    onCancel={() => setShowModelModal(false)}
                />
            </Modal>
        </div>
    );
}

export default Landing;
