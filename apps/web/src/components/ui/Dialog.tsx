import React from 'react';
import { createPortal } from 'react-dom';

export function Dialog({
  open,
  title,
  description,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  if (!open || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/55 px-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-white/10 bg-[#18181b] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        onKeyDownCapture={(event) => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
      >
        <div className="border-b border-[#27272a] px-5 py-4">
          <div className="text-sm font-semibold text-[#f4f4f5]">{title}</div>
          {description ? <div className="mt-1 text-xs text-[#71717b]">{description}</div> : null}
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer ? <div className="flex items-center justify-end gap-2 border-t border-[#27272a] px-5 py-4">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
