/**
 * CliPage — Full-screen CLI route.
 *
 * Accessible at /cli. Behavior controlled by CLI_ENABLED and CLI_ACCESS flags.
 */

import { Navigate } from 'react-router-dom';
import { CLI_ENABLED, CLI_ACCESS, ROUTES, STORAGE_KEYS } from '../../config/constants';
import { useLanguage } from '../../context/LanguageContext';
import { useCli } from './useCli';
import CliTerminal from './CliTerminal';
import './Cli.css';

function getEffectiveCliAccess() {
    const env = CLI_ACCESS;
    if (env && env !== 'public') return env;
    return localStorage.getItem(STORAGE_KEYS.CLI_ACCESS) || 'public';
}

function isLocalhost() {
    return typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
}

export default function CliPage() {
    const { t } = useLanguage();
    const cli = useCli();

    const effectiveAccess = getEffectiveCliAccess();

    if (!CLI_ENABLED || effectiveAccess === 'disabled') {
        return (
            <div className="cli-page cli-page-blocked">
                <h1>{t('cli.disabledTitle')}</h1>
                <p>{t('cli.disabledMessage')}</p>
                <Navigate to={ROUTES.LANDING} replace />
            </div>
        );
    }

    if (effectiveAccess === 'local_only' && !isLocalhost()) {
        return (
            <div className="cli-page cli-page-blocked">
                <h1>{t('cli.localOnlyTitle')}</h1>
                <p>{t('cli.localOnlyMessage')}</p>
                <Navigate to={ROUTES.LANDING} replace />
            </div>
        );
    }

    return (
        <div className="cli-page">
            <CliTerminal {...cli} />
        </div>
    );
}
