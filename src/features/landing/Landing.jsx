/**
 * Landing Page
 * OpenContent IDE
 * 
 * The main entry point - minimal screen with centered input
 * Direct-to-Action philosophy
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
import { ROUTES, STORAGE_KEYS } from '../../config/constants';
import { AI_CONFIG, getTextModelOptions, getImageModelOptions, isAIConfigured } from '../../services/ai';

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
    const [showProModal, setShowProModal] = useState(false);
    const [selectedTextModel, setSelectedTextModel] = useState(
        () => localStorage.getItem(STORAGE_KEYS.SELECTED_TEXT_MODEL) || AI_CONFIG.DEFAULT_TEXT_MODEL
    );
    const [selectedImageModel, setSelectedImageModel] = useState(
        () => localStorage.getItem(STORAGE_KEYS.SELECTED_IMAGE_MODEL) || 'sourceful/riverflow-v2-fast'
    );

    const inputRef = useRef(null);
    const textModelOptions = getTextModelOptions(Boolean(profile?.plan === 'PRO' || profile?.plan === 'TEAMS'));
    const imageModelOptions = getImageModelOptions(Boolean(profile?.plan === 'PRO' || profile?.plan === 'TEAMS'));
    const isPro = Boolean(profile?.plan === 'PRO' || profile?.plan === 'TEAMS');

    const getTextModelLabel = (modelId) => {
        if (modelId === 'nvidia/nemotron-nano-12b-v2-vl:free') return t('workspace.model.textBestName');
        return t('workspace.model.textFreeName');
    };

    const getImageModelLabel = (modelId) => {
        if (modelId === 'bytedance-seed/seedream-4.5') return t('workspace.model.visualBestName');
        return t('workspace.model.visualFreeName');
    };

    const getTextModelBlurb = (modelId) => {
        if (modelId === 'nvidia/nemotron-nano-12b-v2-vl:free') return t('workspace.model.textBestDesc');
        return t('workspace.model.textFreeDesc');
    };

    const getImageModelBlurb = (modelId) => {
        if (modelId === 'bytedance-seed/seedream-4.5') return isPro ? t('workspace.model.visualBestDescPro') : t('workspace.model.visualBestDescFree');
        return t('workspace.model.visualFreeDesc');
    };

    // Placeholder hints that cycle
    const placeholderHints = t('landing.placeholderHints') || [];

    // Typing animation for placeholder
    useEffect(() => {
        if (!Array.isArray(placeholderHints) || placeholderHints.length === 0) return;

        const currentHint = placeholderHints[placeholderIndex];
        let charIndex = 0;
        let typeInterval;
        let pauseTimeout;

        if (isTyping) {
            // Type characters one by one
            typeInterval = setInterval(() => {
                if (charIndex <= currentHint.length) {
                    setDisplayPlaceholder(currentHint.substring(0, charIndex));
                    charIndex++;
                } else {
                    clearInterval(typeInterval);
                    // Pause before erasing
                    pauseTimeout = setTimeout(() => {
                        setIsTyping(false);
                    }, 2000);
                }
            }, 50);
        } else {
            // Erase characters
            let eraseIndex = currentHint.length;
            typeInterval = setInterval(() => {
                if (eraseIndex >= 0) {
                    setDisplayPlaceholder(currentHint.substring(0, eraseIndex));
                    eraseIndex--;
                } else {
                    clearInterval(typeInterval);
                    // Move to next hint
                    setPlaceholderIndex((prev) => (prev + 1) % placeholderHints.length);
                    setIsTyping(true);
                }
            }, 30);
        }

        return () => {
            clearInterval(typeInterval);
            clearTimeout(pauseTimeout);
        };
    }, [placeholderIndex, isTyping, placeholderHints]);

    // Focus input on mount
    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.focus();
        }
    }, []);

    // Handle submit
    const handleSubmit = (e) => {
        if (e) e.preventDefault();
        const trimmedPrompt = prompt.trim();
        if (!trimmedPrompt || isTransitioning) return;

        // Start transition animation for everyone
        setIsTransitioning(true);

        // Wait for animation to finish
        setTimeout(() => {
            if (!isAuthenticated) {
                // Save for later and go to login
                localStorage.setItem(STORAGE_KEYS.PENDING_PROMPT, trimmedPrompt);
                navigate(ROUTES.LOGIN);
            } else {
                // Go straight to workspace
                navigate(ROUTES.WORKSPACE, {
                    state: { initialPrompt: trimmedPrompt }
                });
            }
        }, 800);
    };

    // Handle key press
    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            handleSubmit(e);
        }
    };

    const saveModelSelection = () => {
        localStorage.setItem(STORAGE_KEYS.SELECTED_TEXT_MODEL, selectedTextModel);
        localStorage.setItem(STORAGE_KEYS.SELECTED_IMAGE_MODEL, selectedImageModel);
        setShowModelModal(false);
    };

    return (
        <div className={`landing ${isTransitioning ? 'landing-transitioning' : ''}`}>
            {/* Starfield background */}
            <Starfield starCount={200} />

            {/* Top bar */}
            <header className="landing-header">
                <div className="header-left">
                    {/* Theme toggle */}
                    <button
                        className="icon-button"
                        onClick={toggleTheme}
                        title={isDark ? t('settings.theme.light') : t('settings.theme.dark')}
                    >
                        <Icon
                            src={ICONS.FOQUITO}
                            size="sm"
                            animation="pop"
                        />
                    </button>
                </div>

                <div className="header-right">
                    <button
                        className="icon-button model-shortcut-button"
                        onClick={() => setShowModelModal(true)}
                        title={t('workspace.model.change')}
                    >
                        <Icon
                            src={ICONS.CONFIG}
                            size="sm"
                            alt={t('workspace.model.short')}
                            animation="spin"
                        />
                    </button>

                    <button
                        className="icon-button editor-shortcut-button"
                        onClick={() => navigate(ROUTES.WORKSPACE)}
                        title={t('workspace.editorShortcut')}
                    >
                        <Icon
                            src={ICONS.EDIT_PEN}
                        />
                    </button>

                    {isAuthenticated ? (
                        <button
                            className="user-avatar"
                            onClick={() => navigate(ROUTES.SETTINGS)}
                        >
                            {profile?.avatarUrl ? (
                                <img src={profile.avatarUrl} alt={profile.displayName} />
                            ) : (
                                <span>{profile?.displayName?.charAt(0) || '?'}</span>
                            )}
                        </button>
                    ) : (
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => navigate(ROUTES.LOGIN)}
                        >
                            {t('auth.login')}
                        </Button>
                    )}
                </div>
            </header>

            {/* Main content */}
            <main className="landing-main">
                <div className={`landing-content ${isTransitioning ? 'content-transitioning' : ''}`}>
                    {/* Logo */}
                    <div className="landing-logo">
                        <Icon
                            src={ICONS.LOGO}
                            size={100}
                            alt="OpenContent IDE"
                            className="logo-icon"
                        />
                    </div>

                    {/* Greeting - only show if authenticated AND has displayName */}
                    {isAuthenticated && profile?.displayName && (
                        <p className="landing-greeting">
                            {t('landing.greeting')}, <strong>{profile.displayName.split(' ')[0]}</strong>
                        </p>
                    )}

                    {/* Input form */}
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

                            <button
                                type="submit"
                                className={`landing-submit ${prompt.trim() ? 'visible' : ''}`}
                                disabled={!prompt.trim()}
                            >
                                <Icon
                                    src={ICONS.EXECUTE}
                                    size="md"
                                    animation="pop"
                                />
                            </button>
                        </div>
                    </form>

                    {!isAIConfigured() && (
                        <button
                            className="pro-upgrade-cta"
                            onClick={() => navigate(ROUTES.SETTINGS)}
                            title="Setup API Keys"
                        >
                            <Icon src={ICONS.SETTINGS} size={18} />
                            <span>Setup API Keys to start generating</span>
                        </button>
                    )}
                </div>
            </main>

            {/* Settings link */}
            <footer className="landing-footer">
                <button
                    className="icon-button"
                    onClick={() => navigate(ROUTES.SETTINGS)}
                    title={t('settings.title')}
                >
                    <Icon
                        src={ICONS.SETTINGS}
                        size="sm"
                        animation="spin"
                    />
                </button>
            </footer>

            <Modal
                isOpen={showModelModal}
                onClose={() => setShowModelModal(false)}
                title={t('workspace.model.title')}
                className="modal-model"
                footer={(
                    <>
                        <Button variant="secondary" onClick={() => setShowModelModal(false)}>
                            {t('common.cancel')}
                        </Button>
                        <Button variant="primary" onClick={saveModelSelection}>
                            {t('workspace.model.save')}
                        </Button>
                    </>
                )}
            >
                <div className="model-selector-block">
                    <label htmlFor="landing-text-model">{t('workspace.model.textLabel')}</label>
                    <select
                        id="landing-text-model"
                        value={selectedTextModel}
                        onChange={(e) => setSelectedTextModel(e.target.value)}
                    >
                        {textModelOptions.map((model) => (
                            <option key={model.id} value={model.id}>
                                {getTextModelLabel(model.id)}
                            </option>
                        ))}
                    </select>
                    <div className="model-blurb">
                        {getTextModelBlurb(selectedTextModel)}
                    </div>
                </div>

                <div className="model-selector-block">
                    <label htmlFor="landing-image-model">{t('workspace.model.imageLabel')}</label>
                    <select
                        id="landing-image-model"
                        value={selectedImageModel}
                        onChange={(e) => setSelectedImageModel(e.target.value)}
                    >
                        {imageModelOptions.map((model) => (
                            <option key={model.id} value={model.id}>
                                {getImageModelLabel(model.id)}
                            </option>
                        ))}
                    </select>
                    <div className="model-blurb">
                        {getImageModelBlurb(selectedImageModel)}
                    </div>
                </div>
            </Modal>


        </div>
    );
}

export default Landing;
