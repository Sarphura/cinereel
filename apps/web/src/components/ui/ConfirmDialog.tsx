import React from 'react';
import { Dialog } from './Dialog';

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  confirmingLabel,
  error,
  tone = 'danger',
  disabled,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  confirmingLabel: string;
  error?: string | null;
  tone?: 'danger' | 'primary';
  disabled?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const confirmClassName = tone === 'danger'
    ? 'bg-[#5f2222] text-[#fecaca] hover:bg-[#7a2d2d]'
    : 'bg-[#c47e09] text-white hover:bg-[#d48e19]';

  return (
    <Dialog
      open={open}
      title={title}
      description={description}
      onClose={disabled ? () => undefined : onClose}
      footer={(
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={disabled}
            className="h-9 rounded-lg px-4 text-sm text-[#a1a1aa] transition-colors hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={disabled}
            className={`h-9 rounded-lg px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${confirmClassName}`}
          >
            {disabled ? confirmingLabel : confirmLabel}
          </button>
        </>
      )}
    >
      <div className="text-sm text-[#e4e4e7]">{description}</div>
      {error ? <div className="mt-3 text-xs text-[#fca5a5]">{error}</div> : null}
    </Dialog>
  );
}
