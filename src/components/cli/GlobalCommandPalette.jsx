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
        { id: 'open-workspace', category: 'navigation', label: t('workspace.editorShortcut'), shortcut: '⌘W', action: () => navigate(ROUTES.WORKSPACE) },
        { id: 'open-artifacts', category: 'navigation', label: t('artifactStudio.title'), shortcut: '⇧⌘A', action: () => navigate(ROUTES.ARTIFACTS) },
        { id: 'open-gallery', category: 'navigation', label: t('gallery.title'), shortcut: '⌘G', action: () => navigate(ROUTES.GALLERY) },
        { id: 'open-settings-global', category: 'navigation', label: t('settings.title'), shortcut: '⌘,', action: () => navigate(ROUTES.SETTINGS) },
        { id: 'open-cli-global', category: 'navigation', label: t('cli.title'), shortcut: '⌘`', action: () => navigate(ROUTES.CLI) }
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

    return <CommandPalette isOpen={open} onClose={() => setOpen(false)} commands={commands} />;
}
