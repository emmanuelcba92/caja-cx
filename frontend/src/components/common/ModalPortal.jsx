import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

const ModalPortal = ({ children, onClose }) => {
    // Add Esc key listener
    useEffect(() => {
        const handleEsc = (event) => {
            if (event.key === 'Escape') {
                onClose?.();
            }
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 animate-in fade-in duration-300">
            {/* Backdrop */}
            <div className="fixed inset-0" onClick={onClose} />
            
            {/* Modal Content Container */}
            <div className="relative pointer-events-auto w-full flex justify-center items-center">
                {children}
            </div>
        </div>,
        document.body
    );
};

export default ModalPortal;
