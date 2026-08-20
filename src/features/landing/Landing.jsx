/**
 * Landing Page
 * Prompt-first entry without implicit model selection.
 */
import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import './Landing.css';
import './LandingUx.css';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import Icon, { ICONS } from '../../components/icons/Icon';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import Starfield from '../../components/effects/Starfield';
import ModelSelector from '../../components/model/ModelSelector';
import { ROUTES, STORAGE_KEYS } from '../../config/constants';
import { getActiveTextModel, getActiveVisionModel, getActiveImageModel, getTextModelOptions, isAIConfigured } from '../../services/ai';
import QuickPrompts from '../workspace/components/QuickPrompts';
import { syncBrowserClientConfig } from '../../services/externalSessions';
import '../workspace/components/FeatureComponents.css';

function setOrRemove(key, value) {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
}

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
    const [setupNotice, setSetupNotice] = useState(false);
    const [reducedMotion, setReducedMotion] = useState(false);
    const [selectedTextModel, setSelectedTextModel] = useState(() => getActiveTextModel());
    const [selectedVisionModel, setSelectedVisionModel] = useState(() => getActiveVisionModel());
    const [selectedImageModel, setSelectedImageModel] = useState(() => getActiveImageModel());
    const inputRef = useRef(null);

    const textModels = useMemo(() => getTextModelOptions().filter((model) => model.id), [showModelModal]);
    const activeTextLabel = textModels.find((model) => model.id === selectedTextModel)?.nickname || selectedTextModel || t('workspace.model.noModelSelected');
    const configured = isAIConfigured();

    useEffect(() => {
        const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
        if (!media) return;
        const update = () => setReducedMotion(media.matches);
        update();
        media.addEventListener?.('change', update);
        return () => media.removeEventListener?.('change', update);
    }, []);

    useEffect(() => {
        const hints = t('landing.placeholderHints') || [];
        if (!Array.isArray(hints) || hints.length === 0) return;
        const hint = hints[placeholderIndex];
        if (reducedMotion) {
            setDisplayPlaceholder(hint);
            return;
        }
        let interval;
        let pause;
        if (isTyping) {
            let index = 0;
            interval = window.setInterval(() => {
                if (index <= hint.length) setDisplayPlaceholder(hint.substring(0, index++));
                else {
                    window.clearInterval(interval);
                    pause = window.setTimeout(() => setIsTyping(false), 2000);
                }
            }, 50);
        } else {
            let index = hint.length;
            interval = window.setInterval(() => {
                if (index >= 0) setDisplayPlaceholder(hint.substring(0, index--));
                else {
                    window.clearInterval(interval);
                    setPlaceholderIndex((value) => (value + 1) % hints.length);
                    setIsTyping(true);
                }
            }, 30);
        }
        return () => {
            window.clearInterval(interval);
            window.clearTimeout(pause);
        };
    }, [placeholderIndex, isTyping, reducedMotion, t]);

    useEffect(() => { inputRef.current?.focus(); }, []);
    useEffect(() => {
        syncBrowserClientConfig({ activeTextModel: selectedTextModel, activeVisionModel: selectedVisionModel, activeImageModel: selectedImageModel });
    }, [selectedTextModel, selectedVisionModel, selectedImageModel]);

    useEffect(() => {
        const timer = window.setInterval(() => {
            syncBrowserClientConfig({ activeTextModel: selectedTextModel, activeVisionModel: selectedVisionModel, activeImageModel: selectedImageModel });
        }, 5000);
        return () => window.clearInterval(timer);
    }, [selectedTextModel, selectedVisionModel, selectedImageModel]);

    const resizeComposer = (element) => {
        if (!element) return;
        element.style.height = 'auto';
        element.style.height = `${Math.min(element.scrollHeight, 180)}px`;
    };

    const handleSubmit = (event) => {
        event?.preventDefault();
        const trimmed = prompt.trim();
        if (!trimmed || isTransitioning) return;
        if (!configured) {
            setSetupNotice(true);
            return;
        }
        if (!selectedTextModel) {
            setShowModelModal(true);
            return;
        }
        setIsTransitioning(true);
        navigate(ROUTES.WORKSPACE, { state: { initialPrompt: trimmed } });
    };

    const handleKeyDown = (event) => {
        if (event.key === 'Enter' && !event.shiftKey) handleSubmit(event);
    };

    const handleSaveModelSelection = (textModel, imageModel, visionModel) => {
        setSelectedTextModel(textModel || null);
        setSelectedVisionModel(visionModel || null);
        setSelectedImageModel(imageModel || null);
        setOrRemove(STORAGE_KEYS.SELECTED_TEXT_MODEL, textModel);
        setOrRemove(STORAGE_KEYS.SELECTED_VISION_MODEL, visionModel);
        setOrRemove(STORAGE_KEYS.SELECTED_IMAGE_MODEL, imageModel);
        setShowModelModal(false);
        setSetupNotice(false);
    };

    return (
        <div className={`landing ${isTransitioning ? 'landing-transitioning' : ''}`}>
            {!reducedMotion && <Starfield starCount={200} />}
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
                            {profile?.avatarUrl ? <img src={profile.avatarUrl} alt={profile.displayName} /> : <span>{profile?.displayName?.charAt(0) || '?'}</span>}
                        </button>
                    ) : (
                        <Button variant="secondary" size="sm" onClick={() => navigate(ROUTES.LOGIN)}>{t('auth.login')}</Button>
                    )}
                </div>
            </header>

            <main className="landing-main">
                <div className={`landing-content ${isTransitioning ? 'content-transitioning' : ''}`}>
                    <div className="landing-logo"><Icon src={ICONS.LOGO} size={100} alt="OpenContent IDE" className="logo-icon" /></div>
                    {isAuthenticated && profile?.displayName && <p className="landing-greeting">{t('landing.greeting')}, <strong>{profile.displayName.split(' ')[0]}</strong></p>}

                    <form className="landing-form" onSubmit={handleSubmit}>
                        <div className="landing-input-wrapper">
                            <textarea
                                ref={inputRef}
                                rows={1}
                                className="landing-input"
                                value={prompt}
                                onChange={(event) => { setPrompt(event.target.value); resizeComposer(event.target); }}
                                onKeyDown={handleKeyDown}
                                placeholder={displayPlaceholder || t('landing.placeholder')}
                                autoComplete="off"
                                autoFocus
                            />
                            <button type="submit" className={`landing-submit ${prompt.trim() ? 'visible' : ''}`} disabled={!prompt.trim()} aria-label={t('landing.submit')}>
                                <Icon src={ICONS.EXECUTE} size="md" animation="pop" />
                            </button>
                        </div>
                    </form>

                    <button className="landing-model-chip" type="button" onClick={() => setShowModelModal(true)}>
                        {activeTextLabel}
                    </button>

                    {(!configured || setupNotice) && (
                        <div className="landing-provider-notice" role="status">
                            <span>{t('landing.providerRequired')}</span>
                            <button type="button" onClick={() => navigate(ROUTES.SETTINGS)}>{t('landing.addProvider')}</button>
                        </div>
                    )}

                    {configured && <QuickPrompts language={language} onSelect={(value) => { setPrompt(value); inputRef.current?.focus(); }} hasApiKeys={true} />}
                </div>
            </main>

            <footer className="landing-footer">
                <button className="icon-button" onClick={() => navigate(ROUTES.SETTINGS)} title={t('settings.title')}><Icon src={ICONS.SETTINGS} size="sm" animation="spin" /></button>
            </footer>

            <Modal isOpen={showModelModal} onClose={() => setShowModelModal(false)} title={t('workspace.model.title')} className="modal-model" footer={null}>
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
