import React from 'react';
import { Dialog } from './Dialog';

export function FormDialog({
  open,
  title,
  description,
  value,
  label,
  placeholder,
  submitLabel,
  submittingLabel,
  cancelLabel = '取消',
  error,
  disabled,
  onClose,
  onChange,
  onSubmit,
}: {
  open: boolean;
  title: string;
  description?: string;
  value: string;
  label: string;
  placeholder?: string;
  submitLabel: string;
  submittingLabel: string;
  cancelLabel?: string;
  error?: string | null;
  disabled?: boolean;
  onClose: () => void;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
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
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={disabled}
            className="h-9 rounded-lg bg-[#c47e09] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#d48e19] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {disabled ? submittingLabel : submitLabel}
          </button>
        </>
      )}
    >
      <label className="block text-[11px] font-medium uppercase tracking-[0.5px] text-[#71717b]">{label}</label>
      <input
        autoFocus
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-[#111114] px-3 text-sm text-[#f4f4f5] outline-none transition-colors placeholder:text-[#52525c] focus:border-[#c47e09]"
      />
      {error ? <div className="mt-2 text-xs text-[#fca5a5]">{error}</div> : null}
    </Dialog>
  );
}
