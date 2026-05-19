/**
 * Modal Component
 * OpenContent IDE
 */

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import './Modal.css';
import Icon, { ICONS } from '../icons/Icon';

/**
 * Modal component with backdrop
 * 
 * @param {boolean} isOpen - Modal visibility
 * @param {function} onClose - Close handler
 * @param {string} title - Modal title
 * @param {string} size - 'sm' | 'md' | 'lg' | 'full'
 * @param {boolean} showClose - Show close button
 * @param {boolean} closeOnBackdrop - Close when clicking backdrop
 * @param {boolean} closeOnEsc - Close on Escape key
 * @param {ReactNode} children - Modal content
 * @param {ReactNode} footer - Modal footer
 */
function Modal({
    isOpen,
    onClose,
    title,
    size = 'md',
    showClose = true,
    closeOnBackdrop = true,
    closeOnEsc = true,
    children,
    footer,
    className = ''
}) {
    const modalRef = useRef(null);

    // Close on Escape key
    useEffect(() => {
        if (!isOpen || !closeOnEsc) return;

        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                onClose?.();
            }
        };

        document.addEventListener('keydown', handleEsc);
        return () => document.removeEventListener('keydown', handleEsc);
    }, [isOpen, closeOnEsc, onClose]);

    // Lock body scroll when open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }

        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen]);

    // Focus trap
    useEffect(() => {
        if (isOpen && modalRef.current) {
            modalRef.current.focus();
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleBackdropClick = (e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) {
            onClose?.();
        }
    };

    const modal = (
        <div
            className="modal-backdrop animate-fadeIn"
            onClick={handleBackdropClick}
        >
            <div
                ref={modalRef}
                className={`modal modal-${size} animate-fadeInScale ${className}`}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
            >
                {(title || showClose) && (
                    <div className="modal-header">
                        {title && <h2 className="modal-title">{title}</h2>}
                        {showClose && (
                            <button
                                className="modal-close"
                                onClick={onClose}
                                aria-label="Close modal"
                            >
                                <Icon src={ICONS.CLOSE} size="sm" alt="Close" />
                            </button>
                        )}
                    </div>
                )}

                <div className="modal-body">
                    {children}
                </div>

                {footer && (
                    <div className="modal-footer">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );

    return createPortal(modal, document.body);
}

export default Modal;
