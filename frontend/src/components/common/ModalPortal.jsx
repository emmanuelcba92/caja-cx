import React from 'react';
import { createPortal } from 'react-dom';

const ModalPortal = ({ children, onClose }) => {
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 animate-in fade-in duration-300">
      <div className="fixed inset-0" onClick={onClose} />
      <div className="relative pointer-events-auto">
        {children}
      </div>
    </div>,
    document.body
  );
};

export default ModalPortal;
