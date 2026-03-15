import React, { useEffect, useMemo, useState } from 'react';
import { StreamingVideoPlayer } from './components/StreamingVideoPlayer';
import type { ResourceTreeNode } from './types';
import {
  buildPreviewUrl,
  getPreviewKind,
  requiresStreamingVideoPreview,
  type PreviewKind,
} from './utils';

export type PreviewState = {
  driveKey: string;
  resourcePath: string;
  name: string;
  kind: PreviewKind;
  url: string;
};

export type PreviewLoadState = 'idle' | 'checking' | 'ready' | 'failed';
const PREVIEW_POLL_INTERVAL_MS = 1500

export function useDrivePreview(selectedDriveKey: string | null) {
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [previewLoadState, setPreviewLoadState] = useState<PreviewLoadState>('idle');
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    if (!preview || preview.driveKey === selectedDriveKey) {
      return;
    }

    setPreview(null);
  }, [preview, selectedDriveKey]);

  useEffect(() => {
    if (!preview) {
      setPreviewLoadState('idle');
      setPreviewError(null);
      return;
    }

    const controller = new AbortController();
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRetry = () => {
      retryTimer = setTimeout(() => {
        void validatePreview();
      }, PREVIEW_POLL_INTERVAL_MS);
    };

    const validatePreview = async (): Promise<void> => {
      setPreviewLoadState('checking');
      setPreviewError((current) => (preview.kind === 'video' ? current : null));

      try {
        const response = await fetch(preview.url, {
          method: 'HEAD',
          signal: controller.signal,
        });

        if (response.status === 202) {
          setPreviewError(preview.kind === 'video' ? '视频预览正在转码，请稍候...' : null);
          scheduleRetry();
          return;
        }

        if (!response.ok) {
          throw new Error(`预览接口不可用（${response.status}）。请确认服务端已经重启并加载最新代码。`);
        }

        setPreviewLoadState('ready');
        setPreviewError(null);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setPreviewLoadState('failed');
        setPreviewError(error instanceof Error ? error.message : '预览加载失败。');
      }
    };

    void validatePreview();

    return () => {
      controller.abort();
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
    };
  }, [preview]);

  const previewLabel = useMemo(() => {
    if (!preview) {
      return '';
    }

    if (preview.kind === 'image') {
      return '图片预览';
    }

    if (preview.kind === 'pdf') {
      return 'PDF 预览';
    }

    if (preview.kind === 'audio') {
      return '音频预览';
    }

    return '视频预览';
  }, [preview]);

  const openPreview = (driveKey: string, node: ResourceTreeNode) => {
    const previewKind = getPreviewKind(node);

    if (!previewKind) {
      return false;
    }

    setPreview({
      driveKey,
      resourcePath: node.path,
      name: node.name,
      kind: previewKind,
      url: buildPreviewUrl(driveKey, node.path),
    });
    setPreviewLoadState('checking');
    setPreviewError(null);
    return true;
  };

  return {
    preview,
    previewLabel,
    previewLoadState,
    previewError,
    openPreview,
    closePreview: () => setPreview(null),
    setPreviewLoadState,
    setPreviewError,
  };
}

export function DrivePreviewPanel({
  preview,
  previewLabel,
  previewLoadState,
  previewError,
  onClose,
  onPreviewError,
}: {
  preview: PreviewState;
  previewLabel: string;
  previewLoadState: PreviewLoadState;
  previewError: string | null;
  onClose: () => void;
  onPreviewError: (message: string) => void;
}) {
  return (
    <div className="w-[38%] min-w-[320px] max-w-[520px] flex flex-col bg-[#161619]">
      <div className="h-[43px] px-4 border-b border-[#27272a] flex items-center justify-between shrink-0">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.5px] text-[#71717b]">{previewLabel}</div>
          <div className="text-[12px] text-[#f4f4f5] truncate">{preview.name}</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-[10px] text-[#71717b] hover:text-white transition-colors"
        >
          关闭
        </button>
      </div>

      <div className="flex-1 min-h-0 p-4">
        {previewLoadState === 'checking' ? (
          <div className="h-full rounded border border-white/5 bg-[#111114] flex items-center justify-center p-4 text-sm text-[#71717b] text-center">
            {previewError ?? '正在检查预览资源...'}
          </div>
        ) : null}

        {previewLoadState === 'failed' ? (
          <div className="h-full rounded border border-[#5f2222] bg-[#1b1414] p-4 flex items-center justify-center text-sm text-[#fca5a5] text-center break-all">
            {previewError}
          </div>
        ) : null}

        {previewLoadState === 'ready' && preview.kind === 'image' ? (
          <div className="h-full overflow-auto rounded border border-white/5 bg-[#111114] p-3">
            <img
              src={preview.url}
              alt={preview.name}
              className="max-w-full h-auto mx-auto rounded"
              onError={() => onPreviewError('图片预览加载失败。请确认服务端预览接口可用，且文件仍存在于本地目录。')}
            />
          </div>
        ) : null}

        {previewLoadState === 'ready' && preview.kind === 'pdf' ? (
          <iframe
            title={preview.name}
            src={preview.url}
            className="h-full w-full rounded border border-white/5 bg-white"
            onError={() => onPreviewError('PDF 预览加载失败。请确认服务端预览接口可用，且浏览器允许内嵌 PDF。')}
          />
        ) : null}

        {previewLoadState === 'ready' && preview.kind === 'audio' ? (
          <div className="h-full rounded border border-white/5 bg-[#111114] p-5 flex flex-col justify-center gap-4">
            <div className="text-sm text-[#f4f4f5] break-all">{preview.name}</div>
            <audio
              src={preview.url}
              controls
              className="w-full"
              onError={() => onPreviewError('音频预览加载失败。')}
            />
          </div>
        ) : null}

        {previewLoadState === 'ready' && preview.kind === 'video' ? (
          <div className="h-full rounded border border-white/5 bg-[#111114] p-3 flex items-center justify-center">
            {requiresStreamingVideoPreview(preview.name) ? (
              <StreamingVideoPlayer
                url={preview.url}
                onPreviewError={onPreviewError}
              />
            ) : (
              <video
                src={preview.url}
                controls
                className="max-h-full w-full rounded bg-black"
                onError={() => onPreviewError('视频预览加载失败。')}
              />
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
