import { useEffect, useMemo, useState } from 'react';
import type { ExplorerPreviewState, PreviewLoadState } from '../../../shared/components/explorer/ExplorerPreviewPanel';
import type { ResourceTreeNode } from '../types';
import { buildPreviewUrl, getPreviewKind } from '../utils';

export type DrivePreviewState = ExplorerPreviewState & {
  driveKey: string;
};

export type { PreviewLoadState };

const PREVIEW_POLL_INTERVAL_MS = 1500;

export function useDrivePreview(selectedDriveKey: string | null) {
  const [preview, setPreview] = useState<DrivePreviewState | null>(null);
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
