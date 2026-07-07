import React from 'react';
import { StreamingVideoPlayer } from './StreamingVideoPlayer';

export type PreviewKind = 'image' | 'pdf' | 'audio' | 'video';

export type PreviewLoadState = 'idle' | 'checking' | 'ready' | 'failed';

/**
 * 通用预览状态。业务方（Drive、未来的电影/音乐模块）可以在此基础上追加自己的字段
 * （例如 driveKey），面板本身只依赖这几项。
 */
export type ExplorerPreviewState = {
  resourcePath: string;
  name: string;
  kind: PreviewKind;
  url: string;
};

export type ExplorerPreviewRenderer<TPreview extends ExplorerPreviewState = ExplorerPreviewState> = (context: {
  preview: TPreview;
  previewLoadState: PreviewLoadState;
  previewError: string | null;
  onPreviewError: (message: string) => void;
}) => React.ReactNode;

export type ExplorerPreviewRendererRegistry<TPreview extends ExplorerPreviewState = ExplorerPreviewState> = Partial<
  Record<PreviewKind, ExplorerPreviewRenderer<TPreview>>
>;

export function ExplorerPreviewPanel({
  preview,
  previewLabel,
  previewLoadState,
  previewError,
  onClose,
  onPreviewError,
  renderContent,
  renderers,
  requiresStreamingPlayer,
}: {
  preview: ExplorerPreviewState;
  previewLabel: string;
  previewLoadState: PreviewLoadState;
  previewError: string | null;
  onClose: () => void;
  onPreviewError: (message: string) => void;
  renderContent?: ExplorerPreviewRenderer;
  renderers?: ExplorerPreviewRendererRegistry;
  requiresStreamingPlayer?: (name: string) => boolean;
}) {
  const renderPreviewContent = renderContent ?? renderers?.[preview.kind];
  const customContent = renderPreviewContent?.({ preview, previewLoadState, previewError, onPreviewError });

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
        {customContent ?? (
          <DefaultPreviewContent
            preview={preview}
            previewLoadState={previewLoadState}
            previewError={previewError}
            onPreviewError={onPreviewError}
            requiresStreamingPlayer={requiresStreamingPlayer}
          />
        )}
      </div>
    </div>
  );
}

export function DefaultPreviewContent({
  preview,
  previewLoadState,
  previewError,
  onPreviewError,
  requiresStreamingPlayer,
}: {
  preview: ExplorerPreviewState;
  previewLoadState: PreviewLoadState;
  previewError: string | null;
  onPreviewError: (message: string) => void;
  requiresStreamingPlayer?: (name: string) => boolean;
}) {
  return (
    <>
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
            onError={() => onPreviewError('图片预览加载失败。')}
          />
        </div>
      ) : null}

      {previewLoadState === 'ready' && preview.kind === 'pdf' ? (
        <iframe
          title={preview.name}
          src={preview.url}
          className="h-full w-full rounded border border-white/5 bg-white"
          onError={() => onPreviewError('PDF 预览加载失败。')}
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
          {requiresStreamingPlayer?.(preview.name) ? (
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
    </>
  );
}
