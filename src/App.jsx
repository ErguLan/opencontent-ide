/**
 * Main Application
 * OpenContent IDE
 * 
 * Root component with providers and routing
 * No Firebase required — works 100% locally
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { LanguageProvider } from './context/LanguageContext';
import { AuthProvider } from './context/AuthContext';

// Pages
import Landing from './features/landing/Landing';
import Workspace from './features/workspace/Workspace';
import Settings from './features/settings/Settings';
import Login from './features/auth/Login';

// Styles
import './styles/global.css';

// Routes config
import { ROUTES } from './config/constants';

function App() {
    return (
        <BrowserRouter>
            <ThemeProvider>
                <LanguageProvider>
                    <AuthProvider>
                        <div className="app-container">
                            <Routes>
                                {/* Landing - Main entry point */}
                                <Route path={ROUTES.LANDING} element={<Landing />} />

                                {/* Workspace - Content creation area */}
                                <Route path={ROUTES.WORKSPACE} element={<Workspace />} />
                                <Route path={ROUTES.PROJECT} element={<Workspace />} />

                                {/* Settings */}
                                <Route path={ROUTES.SETTINGS} element={<Settings />} />

                                {/* Login */}
                                <Route path={ROUTES.LOGIN} element={<Login />} />

                                {/* Fallback - redirect to landing */}
                                <Route path="*" element={<Navigate to={ROUTES.LANDING} replace />} />
                            </Routes>
                        </div>
                    </AuthProvider>
                </LanguageProvider>
            </ThemeProvider>
        </BrowserRouter>
    );
}

export default App;
