/**
 * Auth Context
 * OpenContent IDE
 *
 * Local-first auth: no server required by default.
 * The app auto-logs in as a local user with full access.
 *
 * Real authentication is optional. Forks can replace the stub methods
 * (loginGoogle, loginEmail) with their own providers.
 */

/* eslint-disable react-refresh/only-export-components */

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { STORAGE_KEYS } from '../config/constants';

const AuthContext = createContext(null);

const GUEST_PROFILE = {
    uid: 'local-guest',
    displayName: 'Local User',
    email: 'local@opencontent.ide',
    plan: 'PRO',
    avatarUrl: null,
    avatarType: 'letter',
    authProvider: 'local'
};

function getInitialProfile() {
    if (typeof window === 'undefined') return GUEST_PROFILE;
    const saved = localStorage.getItem(STORAGE_KEYS.USER);
    if (!saved) return GUEST_PROFILE;
    try {
        const parsed = JSON.parse(saved);
        return { ...GUEST_PROFILE, ...parsed };
    } catch {
        return GUEST_PROFILE;
    }
}

export function AuthProvider({ children }) {
    const [profile, setProfile] = useState(getInitialProfile);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const isAuthenticated = Boolean(profile && profile.uid);
    const isPro = profile?.plan === 'PRO' || profile?.plan === 'TEAMS';

    useEffect(() => {
        if (profile) {
            localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(profile));
        }
    }, [profile]);

    const clearError = useCallback(() => setError(''), []);

    const loginLocal = useCallback(({ displayName = 'Local User', email = '' } = {}) => {
        const next = {
            ...GUEST_PROFILE,
            displayName: displayName.trim() || GUEST_PROFILE.displayName,
            email: email.trim() || GUEST_PROFILE.email,
            uid: `local_${Date.now()}`,
            authProvider: 'local'
        };
        setProfile(next);
        setError('');
        return { success: true, profile: next };
    }, []);

    const logout = useCallback(() => {
        setProfile(GUEST_PROFILE);
        localStorage.removeItem(STORAGE_KEYS.USER);
        setError('');
    }, []);

    const updateProfile = useCallback((updates) => {
        setProfile((prev) => {
            const next = { ...prev, ...updates };
            localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(next));
            return next;
        });
    }, []);

    /**
     * Stub: replace with real OAuth provider for forks.
     * Returns an error message explaining that the provider must be adapted.
     */
    const loginGoogle = useCallback(async () => {
        setLoading(true);
        setError('');
        await new Promise((resolve) => setTimeout(resolve, 400));
        setLoading(false);
        return {
            success: false,
            error: 'Google auth is not configured in this build. Forks can replace AuthContext.loginGoogle with their own OAuth flow.'
        };
    }, []);

    /**
     * Stub: replace with real email/password provider for forks.
     */
    const loginEmail = useCallback(async (_email, _password) => {
        setLoading(true);
        setError('');
        await new Promise((resolve) => setTimeout(resolve, 400));
        setLoading(false);
        return {
            success: false,
            error: 'Email auth is not configured in this build. Forks can replace AuthContext.loginEmail with their own backend.'
        };
    }, []);

    const value = {
        user: profile,
        profile,
        loading,
        error,
        isAuthenticated,
        isPro,
        loginLocal,
        loginGoogle,
        loginEmail,
        logout,
        updateProfile,
        clearError
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return context;
}

export default AuthContext;
