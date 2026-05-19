/**
 * Button Component
 * OpenContent IDE
 */

import './Button.css';
import Icon from '../icons/Icon';

/**
 * Button component with variants and icon support
 * 
 * @param {string} variant - 'primary' | 'secondary' | 'ghost' | 'danger'
 * @param {string} size - 'sm' | 'md' | 'lg'
 * @param {string} icon - Icon path (left side)
 * @param {string} iconRight - Icon path (right side)
 * @param {boolean} loading - Show loading state
 * @param {boolean} disabled - Disabled state
 * @param {boolean} fullWidth - Full width button
 * @param {string} className - Additional CSS classes
 * @param {ReactNode} children - Button content
 */
function Button({
    variant = 'primary',
    size = 'md',
    icon,
    iconRight,
    loading = false,
    disabled = false,
    fullWidth = false,
    className = '',
    children,
    onClick,
    type = 'button',
    ...props
}) {
    const iconSize = size === 'sm' ? 'xs' : size === 'lg' ? 'md' : 'sm';

    return (
        <button
            type={type}
            className={`
        btn 
        btn-${variant} 
        btn-${size} 
        ${fullWidth ? 'btn-full' : ''} 
        ${loading ? 'btn-loading' : ''} 
        ${className}
      `.trim()}
            disabled={disabled || loading}
            onClick={onClick}
            {...props}
        >
            {loading && (
                <span className="btn-spinner" />
            )}

            {!loading && icon && (
                <Icon src={icon} size={iconSize} alt="" />
            )}

            {children && (
                <span className="btn-text">{children}</span>
            )}

            {!loading && iconRight && (
                <Icon src={iconRight} size={iconSize} alt="" />
            )}
        </button>
    );
}

export default Button;
