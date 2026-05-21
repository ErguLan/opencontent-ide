/**
 * Icon Component
 * OpenContent IDE
 * 
 * Renders SVG icons from /public/icons/
 */

import { useState } from 'react';
import './Icon.css';

/**
 * Icon component that renders SVG icons with optional animations
 * 
 * @param {string} src - Path to the icon (relative to /public)
 * @param {string} alt - Alt text for accessibility
 * @param {string} size - Size: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number
 * @param {string} animation - Hover animation: 'bounce' | 'pop' | 'shake' | 'spin' | 'none'
 * @param {string} className - Additional CSS classes
 * @param {function} onClick - Click handler
 * @param {boolean} disabled - Disabled state
 * @param {string} title - Tooltip text
 */
function Icon({
    src,
    alt = 'icon',
    size = 'md',
    animation = 'none',
    className = '',
    onClick,
    disabled = false,
    title,
    style = {}
}) {
    const [imageError, setImageError] = useState(false);

    const sizeMap = {
        xs: 14,
        sm: 18,
        md: 24,
        lg: 32,
        xl: 48
    };

    const pixelSize = typeof size === 'number' ? size : sizeMap[size] || sizeMap.md;
    const animationClass = animation !== 'none' ? `icon-hover-${animation}` : '';

    if (imageError) {
        return (
            <span
                className={`icon icon-fallback ${className}`}
                style={{ width: pixelSize, height: pixelSize, ...style }}
                title={title}
            >
                ?
            </span>
        );
    }

    return (
        <img
            src={src}
            alt={alt}
            className={`icon ${animationClass} ${onClick ? 'icon-clickable' : ''} ${disabled ? 'icon-disabled' : ''} ${className}`}
            style={{ width: pixelSize, height: pixelSize, ...style }}
            onClick={!disabled ? onClick : undefined}
            onError={() => setImageError(true)}
            title={title}
            draggable={false}
        />
    );
}

/**
 * Icon paths — clean SVG icon set
 * All icons: white outline on transparent, 24×24 viewBox
 */
export const ICONS = {
    // Core UI
    LOGO: '/icons/logo.svg',
    CLOSE: '/icons/close.svg',
    DOCK: '/icons/dock.svg',
    CHECK: '/icons/check.svg',
    INFO: '/icons/info.svg',
    SEARCH: '/icons/search.svg',
    EMPTY: '/icons/empty.svg',

    // Actions
    EXECUTE: '/icons/execute.svg',
    STOP: '/icons/stop.svg',
    RELOAD: '/icons/reload.svg',
    ITERATE: '/icons/iterate.svg',
    IMPORT: '/icons/import.svg',
    EXPORT: '/icons/export.svg',
    DOWNLOAD: '/icons/download.svg',
    COPY: '/icons/copy.svg',
    DELETE: '/icons/delete.svg',
    SHARE: '/icons/share.svg',

    // Editor
    EDIT_PEN: '/icons/edit_pen.svg',
    ADDED: '/icons/add.svg',
    NEW_PROJECT: '/icons/new_project.svg',
    FOLDER: '/icons/folder.svg',

    // Settings & Config
    SETTINGS: '/icons/settings.svg',
    CONFIG: '/icons/config.svg',
    FOQUITO: '/icons/lightbulb.svg',

    // Features
    PRO: '/icons/pro.svg',
    TROPHY: '/icons/trophy.svg',
    ACTIVATE: '/icons/activate.svg',
    DEPLOY: '/icons/deploy.svg'
};

export default Icon;
