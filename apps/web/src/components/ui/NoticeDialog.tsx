import React from 'react';
import { Dialog } from './Dialog';

export function NoticeDialog({
  open,
  title,
  description,
  onClose,
}: {
  open: boolean;
  title: string;
  description: string;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={open}
      title={title}
      description={description}
      onClose={onClose}
      footer={(
        <button
          type="button"
          onClick={onClose}
          className="h-9 rounded-lg bg-[#c47e09] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#d48e19]"
        >
          确定
        </button>
      )}
    >
      <div className="text-sm text-[#e4e4e7] break-all">{description}</div>
    </Dialog>
  );
}
