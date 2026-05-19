/**
 * Loader Component
 * OpenContent IDE
 */

import './Loader.css';
import Icon, { ICONS } from '../icons/Icon';

/**
 * Loader component with Agent branding
 * 
 * @param {string} size - 'sm' | 'md' | 'lg'
 * @param {string} variant - 'spinner' | 'dots' | 'Agent'
 * @param {string} text - Optional loading text
 * @param {boolean} fullScreen - Cover full screen
 */
function Loader({
    size = 'md',
    variant = 'spinner',
    text,
    fullScreen = false,
    className = ''
}) {
    const sizeMap = {
        sm: 24,
        md: 40,
        lg: 64
    };

    const pixelSize = sizeMap[size] || sizeMap.md;

    const content = (
        <div className={`loader loader-${variant} loader-${size} ${className}`}>
            {variant === 'spinner' && (
                <div
                    className="loader-spinner"
                    style={{ width: pixelSize, height: pixelSize }}
                />
            )}

            {variant === 'dots' && (
                <div className="loader-dots">
                    <span className="dot" />
                    <span className="dot" />
                    <span className="dot" />
                </div>
            )}

            {variant === 'Agent' && (
                <div className="loader-Agent">
                    <Icon
                        src={ICONS.LOGO}
                        size={pixelSize}
                        alt="Agent"
                        className="Agent-icon Agent-thinking"
                    />
                    <div className="Agent-rings">
                        <div className="ring ring-1" />
                        <div className="ring ring-2" />
                    </div>
                </div>
            )}

            {text && (
                <span className="loader-text">{text}</span>
            )}
        </div>
    );

    if (fullScreen) {
        return (
            <div className="loader-fullscreen">
                {content}
            </div>
        );
    }

    return content;
}

export default Loader;
