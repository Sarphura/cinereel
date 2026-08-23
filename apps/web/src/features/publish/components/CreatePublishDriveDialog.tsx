import React, { useState } from 'react';
import { Dialog } from '../../../components/ui/Dialog';
import { DRIVE_CONTENT_TYPES } from '../../drive/contentTypes';
import type { DriveContentTypeId } from '../../drive/types';

interface CreatePublishDriveDialogProps {
  open: boolean;
  drivesCount: number;
  creating: boolean;
  onClose: () => void;
  onCreate: (label: string, contentTypeId: DriveContentTypeId) => Promise<void>;
}

export function CreatePublishDriveDialog({ open, drivesCount, creating, onClose, onCreate }: CreatePublishDriveDialogProps) {
  const [label, setLabel] = useState(`我的 Drive ${drivesCount + 1}`);
  const [contentTypeId, setContentTypeId] = useState<DriveContentTypeId>('cinereel.generic');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);

    try {
      await onCreate(label, contentTypeId);
      setLabel(`我的 Drive ${drivesCount + 2}`);
      setContentTypeId('cinereel.generic');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '新建订阅源失败。');
    }
  };

  const handleClose = () => {
    if (!creating) {
      setError(null);
      onClose();
    }
  };

  return (
    <Dialog
      open={open}
      title="新建 Drive"
      description="创建一个新的本地发布 Drive。"
      onClose={handleClose}
      footer={(
        <>
          <button
            type="button"
            onClick={handleClose}
            disabled={creating}
            className="h-9 rounded-lg px-4 text-sm text-[#a1a1aa] transition-colors hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={creating}
            className="h-9 rounded-lg bg-[#c47e09] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#d48e19] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {creating ? '创建中...' : '创建'}
          </button>
        </>
      )}
    >
      <label className="block text-[11px] font-medium uppercase tracking-[0.5px] text-[#71717b]">Drive 名称</label>
      <input
        autoFocus
        value={label}
        onChange={(event) => {
          setLabel(event.target.value);
          setError(null);
        }}
        placeholder="输入 Drive 名称"
        className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-[#111114] px-3 text-sm text-[#f4f4f5] outline-none transition-colors placeholder:text-[#52525c] focus:border-[#c47e09]"
      />
      <div className="mt-4">
        <div className="text-[11px] font-medium uppercase tracking-[0.5px] text-[#71717b]">Drive 类型</div>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {DRIVE_CONTENT_TYPES.map((option) => (
            <button
              key={option.contentTypeId}
              type="button"
              aria-pressed={contentTypeId === option.contentTypeId}
              onClick={() => setContentTypeId(option.contentTypeId)}
              className={`rounded-lg border px-2 py-2 text-xs font-medium transition-colors ${
                contentTypeId === option.contentTypeId
                  ? 'border-[#c47e09] bg-[#c47e09]/15 text-[#f5c46b]'
                  : 'border-white/10 bg-[#111114] text-[#a1a1aa] hover:border-white/20 hover:text-white'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      {error ? <div className="mt-3 text-xs text-[#fca5a5]">{error}</div> : null}
    </Dialog>
  );
}
