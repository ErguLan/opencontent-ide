/**
 * Login Page
 * OpenContent IDE
 * 
 * With improved error handling, fallback support, and starfield background
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

// External URL for account creation
const CREATE_ACCOUNT_URL = 'https://www.opencontent.ide/#settings?section=profile';

function Login() {
    const navigate = useNavigate();
    const { t } = useLanguage();
    const { loginGoogle, loginEmail, loading, error, clearError, isAuthenticated } = useAuth();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isEmailLogin, setIsEmailLogin] = useState(false);
    const [localError, setLocalError] = useState('');

    // Redirect if already authenticated
    useEffect(() => {
        if (isAuthenticated) {
            navigate(ROUTES.LANDING);
        }
    }, [isAuthenticated, navigate]);

    // Clear errors when switching login method
    useEffect(() => {
        clearError();
        setLocalError('');
    }, [isEmailLogin]);

    const handleAuthSuccess = () => {
        const pendingPrompt = localStorage.getItem(STORAGE_KEYS.PENDING_PROMPT);
        if (pendingPrompt) {
            localStorage.removeItem(STORAGE_KEYS.PENDING_PROMPT);
            navigate(ROUTES.WORKSPACE, { state: { initialPrompt: pendingPrompt } });
        } else {
            navigate(ROUTES.LANDING);
        }
    };

    const handleGoogleLogin = async () => {
        setLocalError('');

        try {
            const result = await loginGoogle();

            // If redirect was triggered, don't navigate
            if (result.redirect) {
                return;
            }

            if (result.success) {
                handleAuthSuccess();
            } else if (result.error) {
                setLocalError(result.error);
            }
        } catch (err) {
            setLocalError('Login failed. Please try again.');
        }
    };

    const handleEmailLogin = async (e) => {
        e.preventDefault();
        setLocalError('');

        if (!email) {
            setLocalError('Please enter your email');
            return;
        }

        if (!password) {
            setLocalError('Please enter your password');
            return;
        }

        try {
            const result = await loginEmail(email, password);

            if (result.success) {
                handleAuthSuccess();
            } else if (result.error) {
                setLocalError(result.error);
            }
        } catch (err) {
            setLocalError('Login failed. Please try again.');
        }
    };

    const handleCreateAccount = () => {
        window.open(CREATE_ACCOUNT_URL, '_blank');
    };

    const displayError = localError || error;

    return (
        <div className="login-page">
            {/* Starfield background */}
            <Starfield starCount={150} />

            {/* Back button */}
            <header className="login-header">
                <button className="back-button" onClick={() => navigate(ROUTES.LANDING)}>
                    <Icon src={ICONS.CLOSE} size="sm" />
                </button>
            </header>

            {/* Login card */}
            <main className="login-main">
                <div className="login-card animate-fadeInUp">
                    {/* Logo */}
                    <div className="login-logo">
                        <Icon src={ICONS.LOGO} size={64} alt="OpenContent IDE" />
                    </div>

                    <h1 className="login-title">{t('auth.welcomeBack')}</h1>

                    {/* Error message */}
                    {displayError && (
                        <div className="login-error" onClick={() => { clearError(); setLocalError(''); }}>
                            <Icon src={ICONS.INFO} size="xs" />
                            <span>{displayError}</span>
                            <span className="error-dismiss">×</span>
                        </div>
                    )}

                    {/* Loading state */}
                    {loading && (
                        <div className="login-loading">
                            <Loader variant="spinner" size="md" />
                            <span>Authenticating...</span>
                        </div>
                    )}

                    {!loading && (
                        <>
                            {/* Google login */}
                            {!isEmailLogin && (
                                <div className="login-methods">
                                    <Button
                                        variant="secondary"
                                        fullWidth
                                        onClick={handleGoogleLogin}
                                    >
                                        {t('auth.loginWith')} {t('auth.google')}
                                    </Button>

                                    <div className="login-divider">
                                        <span>o</span>
                                    </div>

                                    <Button
                                        variant="ghost"
                                        fullWidth
                                        onClick={() => setIsEmailLogin(true)}
                                    >
                                        {t('auth.loginWith')} {t('auth.email')}
                                    </Button>
                                </div>
                            )}

                            {/* Email login form */}
                            {isEmailLogin && (
                                <form className="login-form" onSubmit={handleEmailLogin}>
                                    <Input
                                        type="email"
                                        placeholder={t('auth.email')}
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        fullWidth
                                        autoFocus
                                    />

                                    <Input
                                        type="password"
                                        placeholder={t('auth.password')}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        fullWidth
                                    />

                                    <Button
                                        type="submit"
                                        variant="primary"
                                        fullWidth
                                        disabled={!email || !password}
                                    >
                                        {t('auth.login')}
                                    </Button>

                                    <button
                                        type="button"
                                        className="login-back-link"
                                        onClick={() => setIsEmailLogin(false)}
                                    >
                                        {t('common.back')}
                                    </button>
                                </form>
                            )}

                            {/* Create Account Link */}
                            <div className="login-create-account">
                                <span>{t('auth.noAccount')}</span>
                                <button
                                    type="button"
                                    className="create-account-link"
                                    onClick={handleCreateAccount}
                                >
                                    {t('auth.createAccount')}
                                </button>
                            </div>
                        </>
                    )}

                    {/* Security note */}
                    <p className="login-security-note">
                        Secure login via Firebase Authentication
                    </p>
                </div>
            </main>
        </div>
    );
}

export default Login;
