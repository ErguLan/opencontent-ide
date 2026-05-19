/**
 * Input Component
 * OpenContent IDE
 */

import { forwardRef } from 'react';
import './Input.css';
import Icon from '../icons/Icon';

/**
 * Input component with icon support
 * 
 * @param {string} variant - 'default' | 'hero' (for landing page)
 * @param {string} size - 'sm' | 'md' | 'lg' | 'hero'
 * @param {string} icon - Icon path (left side)
 * @param {string} iconRight - Icon path (right side)
 * @param {string} error - Error message
 * @param {boolean} fullWidth - Full width input
 * @param {string} className - Additional CSS classes
 */
const Input = forwardRef(function Input({
    variant = 'default',
    size = 'md',
    icon,
    iconRight,
    error,
    fullWidth = false,
    className = '',
    onIconRightClick,
    ...props
}, ref) {
    const iconSize = size === 'sm' ? 'xs' : size === 'lg' || size === 'hero' ? 'md' : 'sm';

    return (
        <div className={`input-wrapper ${fullWidth ? 'input-full' : ''} ${className}`}>
            <div className={`
        input-container 
        input-${variant} 
        input-${size}
        ${icon ? 'has-icon-left' : ''} 
        ${iconRight ? 'has-icon-right' : ''}
        ${error ? 'has-error' : ''}
      `.trim()}>
                {icon && (
                    <span className="input-icon input-icon-left">
                        <Icon src={icon} size={iconSize} alt="" />
                    </span>
                )}

                <input
                    ref={ref}
                    className="input-field"
                    {...props}
                />

                {iconRight && (
                    <span
                        className={`input-icon input-icon-right ${onIconRightClick ? 'clickable' : ''}`}
                        onClick={onIconRightClick}
                    >
                        <Icon src={iconRight} size={iconSize} alt="" />
                    </span>
                )}
            </div>

            {error && (
                <span className="input-error">{error}</span>
            )}
        </div>
    );
});

export default Input;
