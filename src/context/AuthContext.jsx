/**
 * Auth Context
 * OpenContent IDE
 * 
 * Local-first auth: No server required.
 * Auto-logs in as "Local User" with full access (PRO).
 * If you want real auth, configure Firebase in .env (optional).
 */

import { createContext, useContext, useState, useEffect } from 'react';
import { STORAGE_KEYS } from '../config/constants';

const AuthContext = createContext(null);

const LOCAL_USER_PROFILE = {
    uid: 'local',
    displayName: 'Local User',
    email: 'local@opencontent.ide',
    plan: 'PRO',
    avatarUrl: null,
    avatarType: 'letter'
};

export function AuthProvider({ children }) {
    const [user, setUser] = useState(LOCAL_USER_PROFILE);
    const [profile, setProfile] = useState(LOCAL_USER_PROFILE);
    const [loading, setLoading] = useState(false);

    const isAuthenticated = Boolean(user);
    const isPro = profile?.plan === 'PRO';

    useEffect(() => {
        // Auto-login as local user
        const saved = localStorage.getItem(STORAGE_KEYS.USER);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                setProfile({ ...LOCAL_USER_PROFILE, ...parsed });
            } catch {
                // fallback to default
            }
        }
        setLoading(false);
    }, []);

    const updateProfile = (updates) => {
        const next = { ...profile, ...updates };
        setProfile(next);
        localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(next));
    };

    const logout = () => {
        setUser(LOCAL_USER_PROFILE);
        setProfile(LOCAL_USER_PROFILE);
        localStorage.removeItem(STORAGE_KEYS.USER);
    };

    return (
        <AuthContext.Provider value={{
            user,
            profile,
            loading,
            isAuthenticated,
            isPro,
            updateProfile,
            logout
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return context;
}

export default AuthContext;
