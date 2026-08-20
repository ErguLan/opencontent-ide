/**
 * Modal Component
 * Accessible focus trap, Escape handling and focus restoration.
 */
import { useEffect, useRef, useId } from 'react';
import { createPortal } from 'react-dom';
import './Modal.css';
import { useLanguage } from '../../context/LanguageContext';
import Icon, { ICONS } from '../icons/Icon';

const FOCUSABLE = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

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
    const { t } = useLanguage();
    const modalRef = useRef(null);
    const previousFocusRef = useRef(null);
    const titleId = useId();

    useEffect(() => {
        if (!isOpen) return undefined;
        previousFocusRef.current = document.activeElement;
        const modal = modalRef.current;
        const first = modal?.querySelector(FOCUSABLE);
        window.requestAnimationFrame(() => (first || modal)?.focus?.());

        const handleKeyDown = (event) => {
            if (event.key === 'Escape' && closeOnEsc) {
                event.preventDefault();
                onClose?.();
                return;
            }
            if (event.key !== 'Tab' || !modal) return;
            const focusable = [...modal.querySelectorAll(FOCUSABLE)].filter((element) => !element.hasAttribute('disabled'));
            if (focusable.length === 0) {
                event.preventDefault();
                modal.focus();
                return;
            }
            const firstElement = focusable[0];
            const lastElement = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === firstElement) {
                event.preventDefault();
                lastElement.focus();
            } else if (!event.shiftKey && document.activeElement === lastElement) {
                event.preventDefault();
                firstElement.focus();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            const previous = previousFocusRef.current;
            window.requestAnimationFrame(() => previous?.focus?.());
        };
    }, [isOpen, closeOnEsc, onClose]);

    useEffect(() => {
        if (!isOpen) return undefined;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = previousOverflow; };
    }, [isOpen]);

    if (!isOpen) return null;

    const modal = (
        <div className="modal-backdrop animate-fadeIn" onClick={(event) => {
            if (closeOnBackdrop && event.target === event.currentTarget) onClose?.();
        }}>
            <div
                ref={modalRef}
                className={`modal modal-${size} animate-fadeInScale ${className}`}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-labelledby={title ? titleId : undefined}
            >
                {(title || showClose) && (
                    <div className="modal-header">
                        {title && <h2 id={titleId} className="modal-title">{title}</h2>}
                        {showClose && (
                            <button className="modal-close" onClick={onClose} aria-label={t('common.closeModal')}>
                                <Icon src={ICONS.CLOSE} size="sm" alt="" />
                            </button>
                        )}
                    </div>
                )}
                <div className="modal-body">{children}</div>
                {footer && <div className="modal-footer">{footer}</div>}
            </div>
        </div>
    );

    return createPortal(modal, document.body);
}

export default Modal;
