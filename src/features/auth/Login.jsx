/**
 * Login Page
 * OpenContent IDE
 *
 * Local-first login by default. Real OAuth/email auth is optional and must
 * be adapted by forks. This page explains that clearly.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Login.css';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import Icon, { ICONS } from '../../components/icons/Icon';
import Button from '../../components/common/Button';
import Input from '../../components/common/Input';
import Loader from '../../components/common/Loader';
import Starfield from '../../components/effects/Starfield';
import { ROUTES, STORAGE_KEYS } from '../../config/constants';

const REPO_URL = 'https://github.com/ErguLan/opencontent-ide';

function Login() {
    const navigate = useNavigate();
    const { t } = useLanguage();
    const { loginLocal, loginGoogle, loginEmail, loading, error, clearError, isAuthenticated } = useAuth();

    const [displayName, setDisplayName] = useState('');
    const [email, setEmail] = useState('');
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [localError, setLocalError] = useState('');

    useEffect(() => {
        if (isAuthenticated) {
            const pendingPrompt = localStorage.getItem(STORAGE_KEYS.PENDING_PROMPT);
            if (pendingPrompt) {
                localStorage.removeItem(STORAGE_KEYS.PENDING_PROMPT);
                navigate(ROUTES.WORKSPACE, { state: { initialPrompt: pendingPrompt } });
            } else {
                navigate(ROUTES.LANDING);
            }
        }
    }, [isAuthenticated, navigate]);

    useEffect(() => {
        clearError();
        setLocalError('');
    }, [showAdvanced, clearError]);

    const handleLocalLogin = async (e) => {
        e.preventDefault();
        setLocalError('');
        if (!displayName.trim()) {
            setLocalError(t('auth.nameRequired'));
            return;
        }
        const result = loginLocal({ displayName, email });
        if (result.success) {
            const pendingPrompt = localStorage.getItem(STORAGE_KEYS.PENDING_PROMPT);
            if (pendingPrompt) {
                localStorage.removeItem(STORAGE_KEYS.PENDING_PROMPT);
                navigate(ROUTES.WORKSPACE, { state: { initialPrompt: pendingPrompt } });
            } else {
                navigate(ROUTES.LANDING);
            }
        }
    };

    const handleGoogleLogin = async () => {
        setLocalError('');
        const result = await loginGoogle();
        if (result.error) setLocalError(result.error);
    };

    const handleEmailLogin = async (e) => {
        e.preventDefault();
        setLocalError('');
        if (!email.trim()) {
            setLocalError(t('auth.emailRequired'));
            return;
        }
        const result = await loginEmail(email, 'password');
        if (result.error) setLocalError(result.error);
    };

    const displayError = localError || error;

    return (
        <div className="login-page">
            <Starfield starCount={150} />

            <header className="login-header">
                <button className="back-button" onClick={() => navigate(ROUTES.LANDING)} aria-label={t('common.back')}>
                    <Icon src={ICONS.CLOSE} size="sm" />
                </button>
            </header>

            <main className="login-main">
                <div className="login-card animate-fadeInUp">
                    <div className="login-logo">
                        <Icon src={ICONS.LOGO} size={64} alt="OpenContent IDE" />
                    </div>

                    <h1 className="login-title">{t('auth.welcome')}</h1>
                    <p className="login-subtitle">{t('auth.localFirstSubtitle')}</p>

                    {displayError && (
                        <div className="login-error" onClick={() => { clearError(); setLocalError(''); }}>
                            <Icon src={ICONS.INFO} size="xs" />
                            <span>{displayError}</span>
                            <span className="error-dismiss">×</span>
                        </div>
                    )}

                    {loading && (
                        <div className="login-loading">
                            <Loader variant="spinner" size="md" />
                            <span>{t('common.loading')}</span>
                        </div>
                    )}

                    {!loading && (
                        <>
                            <form className="login-form" onSubmit={handleLocalLogin}>
                                <Input
                                    type="text"
                                    placeholder={t('auth.displayName')}
                                    value={displayName}
                                    onChange={(e) => setDisplayName(e.target.value)}
                                    fullWidth
                                    autoFocus
                                />
                                <Input
                                    type="email"
                                    placeholder={t('auth.emailOptional')}
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    fullWidth
                                />
                                <Button type="submit" variant="primary" fullWidth disabled={!displayName.trim()}>
                                    {t('auth.continueLocal')}
                                </Button>
                            </form>

                            <div className="login-divider">
                                <span>{t('common.or')}</span>
                            </div>

                            <button
                                type="button"
                                className="login-advanced-toggle"
                                onClick={() => setShowAdvanced((prev) => !prev)}
                            >
                                {showAdvanced ? t('auth.hideAdvanced') : t('auth.showAdvanced')}
                            </button>

                            {showAdvanced && (
                                <div className="login-advanced">
                                    <p className="login-advanced-note">{t('auth.advancedNote')}</p>
                                    <Button variant="secondary" fullWidth onClick={handleGoogleLogin}>
                                        {t('auth.loginWith')} {t('auth.google')}
                                    </Button>
                                    <form className="login-form" onSubmit={handleEmailLogin}>
                                        <Input
                                            type="email"
                                            placeholder={t('auth.email')}
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            fullWidth
                                        />
                                        <Input
                                            type="password"
                                            placeholder={t('auth.password')}
                                            value=""
                                            disabled
                                            fullWidth
                                        />
                                        <Button type="submit" variant="secondary" fullWidth disabled={!email.trim()}>
                                            {t('auth.loginWith')} {t('auth.email')}
                                        </Button>
                                    </form>
                                    <a
                                        className="login-repo-link"
                                        href={REPO_URL}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        {t('auth.forkDocs')}
                                    </a>
                                </div>
                            )}

                            <p className="login-security-note">{t('auth.localSecurityNote')}</p>
                        </>
                    )}
                </div>
            </main>
        </div>
    );
}

export default Login;
