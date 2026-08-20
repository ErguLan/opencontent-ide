import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { ROUTES } from '../../config/constants';
import CommandPalette from './CommandPalette';

function isEditableTarget(target) {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

export default function GlobalCommandPalette() {
    const navigate = useNavigate();
    const { t } = useLanguage();
    const [open, setOpen] = useState(false);

    const commands = useMemo(() => [
        { id: 'open-workspace', category: 'navigation', label: t('workspace.editorShortcut'), shortcut: 'Ctrl/⌘ W', keywords: ['editor', 'workspace'], action: () => navigate(ROUTES.WORKSPACE) },
        { id: 'open-artifacts', category: 'navigation', label: t('artifactStudio.title'), shortcut: 'Ctrl/⌘ ⇧ A', keywords: ['artifact', 'pdf', 'diagram', 'document'], action: () => navigate(ROUTES.ARTIFACTS) },
        { id: 'open-gallery', category: 'navigation', label: t('gallery.title'), shortcut: 'Ctrl/⌘ G', keywords: ['gallery', 'image', 'asset', 'media'], action: () => navigate(ROUTES.GALLERY) }
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
            } else if (!event.shiftKey && event.key.toLowerCase() === 'g') {
                event.preventDefault();
                navigate(ROUTES.GALLERY);
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [navigate]);

    return <CommandPalette isOpen={open} onClose={() => setOpen(false)} commands={commands} />;
}
