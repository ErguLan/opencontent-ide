/**
 * Icon Component
 * OpenContent IDE
 * 
 * Wrapper for PNG icons from /public folders
 * NO EMOJIS - Only PNG icons
 */

import { useState } from 'react';
import './Icon.css';

/**
 * Icon component that renders PNG icons with optional animations
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

    // Size mapping
    const sizeMap = {
        xs: 14,
        sm: 18,
        md: 24,
        lg: 32,
        xl: 48
    };

    const pixelSize = typeof size === 'number' ? size : sizeMap[size] || sizeMap.md;

    // Animation class mapping
    const animationClass = animation !== 'none' ? `icon-hover-${animation}` : '';

    // Handle image load error
    const handleError = () => {
        setImageError(true);
    };

    // If image failed to load, show fallback
    if (imageError) {
        return (
            <span
                className={`icon icon-fallback ${className}`}
                style={{
                    width: pixelSize,
                    height: pixelSize,
                    ...style
                }}
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
            style={{
                width: pixelSize,
                height: pixelSize,
                ...style
            }}
            onClick={!disabled ? onClick : undefined}
            onError={handleError}
            title={title}
            draggable={false}
        />
    );
}

/**
 * Preloaded icon paths for common icons
 */
export const ICONS = {
    // Assets folder
    EXECUTE: '/Assets/ExecuteButton.png',
    EDIT: '/Assets/EditionButton.png',
    DELETE: '/Assets/BoteDeDeletePaper.png',
    FOLDER: '/Assets/CarpetType.png',
    FOLDER_OPEN: '/Assets/CarpetOpenType.png',
    FOLDER_NEW: '/Assets/CarpetNewType.png',
    SETTINGS: '/Assets/settings.png',
    CHECK: '/Assets/check-circle.png',
    ADDED: '/Assets/added.png',
    BOOK: '/Assets/book.png',
    ROTATE: '/Assets/icon_rotate.png',
    LOOK: '/Assets/LookAtFor.png',
    PRO: '/Assets/Pro-P.png',
    TROPHY: '/Assets/trophy.png',
    NO_IMAGE: '/Assets/NoImage.png',
    AI_Agent: '/Assets/AITlu\'k.png',

    // Console folder
    CONSOLE: '/Console/console-icon.png',
    EMPTY: '/Console/empty-icon.png',
    SEARCH: '/Console/search-icon.png',
    DELETE_ALT: '/Console/icon_delete.png',

    // IndexAUs folder
    ACTIVATE: '/IndexAUs/Activate.png',
    DELETE_AU: '/IndexAUs/Delete.png',
    DEPLOY: '/IndexAUs/Deploy.png',
    DRAFT: '/IndexAUs/Draft.png',
    DUPLICATE: '/IndexAUs/Duplicate.png',
    EDIT_AU: '/IndexAUs/Edit.png',
    HISTORY: '/IndexAUs/History.png',
    RENAME: '/IndexAUs/Rename.png',
    SHARE: '/IndexAUs/Share.png',

    // Nav folder
    ACTIVATION_NODE: '/nav/ActivationNode.png',
    EXECUTE_NAV: '/nav/ExecuteButton.png',
    EXECUTE_LOOP: '/nav/ExecuteButtonLoop.png',
    SOCIAL: '/nav/Social.png',
    ADDED_NAV: '/nav/added.png',
    CONFIG: '/nav/icon_config.png',
    IMPORT: '/nav/import.png',
    SERVER: '/nav/server.png',

    // Panel folder
    AUTOCONNECT: '/panel/Autoconnect.png',
    FOQUITO: '/panel/Foquito.png',
    ADVDE: '/panel/advde.png',
    CLOSE: '/panel/close-icon.png',
    DOCK: '/panel/dock-icon.png',
    CONFIG_PANEL: '/panel/icon_config.png',
    INFO: '/panel/icon_info.png',

    // Toolbar right folder
    COPY: '/toolbarright/CopyImage.png',
    PASTE: '/toolbarright/PasteImage.png',
    CUT: '/toolbarright/icon_Cut.png',
    DELETE_TOOLBAR: '/toolbarright/icon_delete.png',
    EDIT_PEN: '/toolbarright/EditCasePen.png',
    PROPERTIES: '/toolbarright/icon_properties.png',
    ROTATE_TOOLBAR: '/toolbarright/icon_rotate.png',
    LOOK_TOOLBAR: '/toolbarright/LookAtFor.png',

    // Logo
    LOGO: '/Logo.png'
};

export default Icon;
