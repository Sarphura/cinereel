import React, { useRef, useState } from 'react';
import { IconUpload } from '../../../components/icons/Icons';
import { DriveSummaryHeader } from '../../drive/components/DriveSummaryHeader';
import type { DriveRecord } from '../../drive/types';

interface PublishDetailHeaderProps {
  drive: DriveRecord | null;
  submitting: boolean;
  onUpload: (files: File[]) => Promise<void>;
}

const directoryInputAttributes = {
  directory: '',
  webkitdirectory: '',
} as Record<string, string>;

export function PublishDetailHeader({
  drive,
  submitting,
  onUpload,
}: PublishDetailHeaderProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const directoryInputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!drive) {
    return null;
  }

  if ((drive.status ?? 'ready') !== 'ready') {
    return <DriveSummaryHeader drive={drive} />;
  }

  const handleFileSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) {
      return;
    }

    setError(null);
    try {
      await onUpload(files);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '上传文件失败。');
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <DriveSummaryHeader drive={drive} />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={submitting}
          className="flex h-7 items-center gap-2 rounded bg-[#c47e09] px-3 text-[11px] font-bold text-white shadow-[0_0_15px_rgba(196,126,9,0.24)] transition-all hover:bg-[#d48e19] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <IconUpload className="size-3.5" />
          {submitting ? '上传中...' : '上传文件'}
        </button>
        <button
          type="button"
          onClick={() => directoryInputRef.current?.click()}
          disabled={submitting}
          className="flex h-7 items-center gap-2 rounded bg-white/8 px-3 text-[11px] font-bold text-[#d4d4d8] transition-all hover:bg-white/12 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <IconUpload className="size-3.5" />
          {submitting ? '上传中...' : '上传目录'}
        </button>
      </div>
      <input
        ref={fileInputRef}
        aria-label="选择上传文件"
        type="file"
        multiple
        className="hidden"
        onChange={(event) => void handleFileSelection(event)}
      />
      <input
        ref={directoryInputRef}
        aria-label="选择上传目录"
        type="file"
        multiple
        className="hidden"
        {...directoryInputAttributes}
        onChange={(event) => void handleFileSelection(event)}
      />
      {error ? <div className="text-xs text-[#fca5a5]">{error}</div> : null}
    </div>
  );
}
