/**
 * Tooltip Component
 * OpenContent IDE
 */

import { useState, useRef } from 'react';
import './Tooltip.css';

/**
 * Tooltip component
 * 
 * @param {string} content - Tooltip text
 * @param {string} position - 'top' | 'bottom' | 'left' | 'right'
 * @param {number} delay - Delay before showing (ms)
 * @param {ReactNode} children - Trigger element
 */
function Tooltip({
    content,
    position = 'top',
    delay = 300,
    children,
    className = ''
}) {
    const [isVisible, setIsVisible] = useState(false);
    const timeoutRef = useRef(null);

    const showTooltip = () => {
        timeoutRef.current = setTimeout(() => {
            setIsVisible(true);
        }, delay);
    };

    const hideTooltip = () => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }
        setIsVisible(false);
    };

    if (!content) {
        return children;
    }

    return (
        <div
            className={`tooltip-wrapper ${className}`}
            onMouseEnter={showTooltip}
            onMouseLeave={hideTooltip}
            onFocus={showTooltip}
            onBlur={hideTooltip}
        >
            {children}

            {isVisible && (
                <div
                    className={`tooltip tooltip-${position} animate-fadeIn`}
                    role="tooltip"
                >
                    {content}
                    <span className="tooltip-arrow" />
                </div>
            )}
        </div>
    );
}

export default Tooltip;
