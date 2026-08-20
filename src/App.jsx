/**
 * Main Application
 * OpenContent IDE
 */
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { LanguageProvider } from './context/LanguageContext';
import { AuthProvider } from './context/AuthContext';
import Landing from './features/landing/Landing';
import Workspace from './features/workspace/Workspace';
import Settings from './features/settings/Settings';
import Login from './features/auth/Login';
import CliPage from './features/cli/CliPage';
import GalleryPage from './features/gallery/GalleryPage';
import ArtifactStudio from './features/artifacts/ArtifactStudio';
import './styles/global.css';
import { ROUTES } from './config/constants';

function App() {
    return (
        <BrowserRouter>
            <ThemeProvider>
                <LanguageProvider>
                    <AuthProvider>
                        <div className="app-container">
                            <Routes>
                                <Route path={ROUTES.LANDING} element={<Landing />} />
                                <Route path={ROUTES.WORKSPACE} element={<Workspace />} />
                                <Route path={ROUTES.PROJECT} element={<Workspace />} />
                                <Route path={ROUTES.SETTINGS} element={<Settings />} />
                                <Route path={ROUTES.LOGIN} element={<Login />} />
                                <Route path={ROUTES.CLI} element={<CliPage />} />
                                <Route path={ROUTES.GALLERY} element={<GalleryPage />} />
                                <Route path={ROUTES.ARTIFACTS} element={<ArtifactStudio />} />
                                <Route path={`${ROUTES.ARTIFACTS}/:artifactId`} element={<ArtifactStudio />} />
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
