import React, { useState } from 'react';
import { IconUpload } from '../../../components/icons/Icons';
import { FormDialog } from '../../../components/ui/FormDialog';
import { DriveSummaryHeader } from '../../drive/components/DriveSummaryHeader';
import type { DriveRecord } from '../../drive/types';
import { ManualMovieMountDialog } from './ManualMovieMountDialog';
import type { ManualMovieMountInput } from '../../jobs/api';

interface PublishDetailHeaderProps {
  drive: DriveRecord | null;
  submitting: boolean;
  defaultMountPath?: string | null;
  onMount: (targetPath: string) => Promise<void>;
  onManualMovieMount: (input: ManualMovieMountInput) => Promise<void>;
}

export function PublishDetailHeader({
  drive,
  submitting,
  defaultMountPath,
  onMount,
  onManualMovieMount,
}: PublishDetailHeaderProps) {
  const [showMountDialog, setShowMountDialog] = useState(false);
  const [showManualMovieMountDialog, setShowManualMovieMountDialog] = useState(false);
  const [mountPath, setMountPath] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!drive) {
    return null;
  }

  if ((drive.status ?? 'ready') !== 'ready') {
    return <DriveSummaryHeader drive={drive} />;
  }

  const handleSubmit = async () => {
    setError(null);

    try {
      await onMount(mountPath);
      setMountPath('');
      setShowMountDialog(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建挂载任务失败。');
    }
  };

  const handleClose = () => {
    if (!submitting) {
      setError(null);
      setMountPath('');
      setShowMountDialog(false);
    }
  };

  const openAutomaticMountDialog = () => {
    setMountPath(defaultMountPath ?? '');
    setError(null);
    setShowMountDialog(true);
  };

  return (
    <>
      <DriveSummaryHeader drive={drive} />
      <div className="flex items-center gap-2">
        {drive.type === 'movie' ? (
          <>
            <button
              onClick={() => setShowManualMovieMountDialog(true)}
              disabled={submitting}
              className="flex items-center gap-2 h-7 px-3 bg-[#c47e09] rounded text-[11px] font-bold text-white hover:bg-[#d48e19] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(196,126,9,0.24)]"
            >
              <IconUpload className="size-3.5" />
              手动挂载
            </button>
            <button
              onClick={openAutomaticMountDialog}
              disabled={submitting}
              className="flex items-center gap-2 h-7 px-3 bg-white/8 rounded text-[11px] font-bold text-[#d4d4d8] hover:bg-white/12 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <IconUpload className="size-3.5" />
              自动挂载
            </button>
          </>
        ) : (
          <button
            onClick={openAutomaticMountDialog}
            disabled={submitting}
            className="flex items-center gap-2 h-7 px-3 bg-[#c47e09] rounded text-[11px] font-bold text-white hover:bg-[#d48e19] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(196,126,9,0.24)]"
          >
            <IconUpload className="size-3.5" />
            {submitting ? '进行中' : '挂载'}
          </button>
        )}
      </div>
      <FormDialog
        open={showMountDialog}
        title="自动挂载目录"
        description={`将本地目录挂载到 ${drive.name}`}
        label="本地路径"
        value={mountPath}
        placeholder="/path/to/local/folder"
        submitLabel="加入任务"
        submittingLabel="提交中..."
        error={error}
        disabled={submitting}
        onClose={handleClose}
        onChange={(value) => {
          setMountPath(value);
          setError(null);
        }}
        onSubmit={() => void handleSubmit()}
      />
      <ManualMovieMountDialog
        open={showManualMovieMountDialog}
        submitting={submitting}
        driveName={drive.name}
        onClose={() => setShowManualMovieMountDialog(false)}
        onMount={onManualMovieMount}
      />
    </>
  );
}
