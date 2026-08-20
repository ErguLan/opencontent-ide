import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { ROUTES } from '../../config/constants';
import CommandPalette from './CommandPalette';
import './GlobalCommandPalette.css';

function isEditableTarget(target) {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

export default function GlobalCommandPalette() {
    const navigate = useNavigate();
    const { t } = useLanguage();
    const [open, setOpen] = useState(false);

    const commands = useMemo(() => [
        { id: 'open-workspace', category: 'navigation', label: t('workspace.editorShortcut'), keywords: ['editor', 'workspace'], action: () => navigate(ROUTES.WORKSPACE) },
        { id: 'open-ai-setup', category: 'config', label: t('setup.title'), keywords: ['provider', 'model', 'api', 'ollama', 'setup', 'config'], action: () => navigate(ROUTES.SETUP) },
        { id: 'open-library', category: 'assets', label: t('library.title'), keywords: ['library', 'assets', 'media', 'artifact', 'pdf', 'diagram', 'document', 'image'], action: () => navigate(ROUTES.LIBRARY) },
        { id: 'open-artifacts', category: 'navigation', label: t('artifactStudio.title'), shortcut: 'Ctrl/⌘ ⇧ A', keywords: ['artifact', 'pdf', 'diagram', 'document'], action: () => navigate(ROUTES.ARTIFACTS) },
        { id: 'open-gallery', category: 'navigation', label: t('gallery.title'), keywords: ['gallery', 'image', 'asset', 'media'], action: () => navigate(ROUTES.GALLERY) }
    ], [navigate, t]);

    useEffect(() => {
        const onKeyDown = (event) => {
            const commandKey = event.metaKey || event.ctrlKey;
            const editable = isEditableTarget(event.target);

            if (commandKey && event.key.toLowerCase() === 'k') {
                event.preventDefault();
                setOpen((value) => !value);
                return;
            }
            if (!commandKey || editable) return;

            if (event.key === '`') {
                event.preventDefault();
                navigate(ROUTES.CLI);
            } else if (event.key === ',' && !event.shiftKey) {
                event.preventDefault();
                navigate(ROUTES.SETTINGS);
            } else if (event.shiftKey && event.key.toLowerCase() === 'a') {
                event.preventDefault();
                navigate(ROUTES.ARTIFACTS);
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [navigate]);

    return (
        <>
            <button className="oc-global-palette-trigger" type="button" onClick={() => setOpen(true)} aria-label={t('cli.title')}>
                <span>{t('cli.title')}</span><kbd>Ctrl/⌘ K</kbd>
            </button>
            <CommandPalette isOpen={open} onClose={() => setOpen(false)} commands={commands} />
        </>
    );
}
