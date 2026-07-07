import React from 'react';

export function ExplorerActionErrorToast({
  message,
  onClose,
}: {
  message: string | null;
  onClose: () => void;
}) {
  if (!message) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-4">
      <div className="pointer-events-auto flex max-w-lg items-start gap-3 rounded-lg border border-[#7f1d1d] bg-[#2a1212]/95 px-4 py-2.5 text-xs text-[#fca5a5] shadow-xl backdrop-blur-sm">
        <span className="min-w-0 flex-1 wrap-break-word">{message}</span>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 text-[#fca5a5]/70 transition-colors hover:text-[#fca5a5]"
        >
          关闭
        </button>
      </div>
    </div>
  );
}
