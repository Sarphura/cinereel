import React, { useEffect, useState } from 'react';

const STREAMING_VIDEO_MIME_TYPE = 'video/mp4; codecs="avc1.640029,mp4a.40.2"';

export function StreamingVideoPlayer({
  url,
  onPreviewError,
}: {
  url: string;
  onPreviewError: (message: string) => void;
}) {
  const [mediaSourceUrl, setMediaSourceUrl] = useState<string | null>(null);

  useEffect(() => {
    if (typeof MediaSource === 'undefined') {
      onPreviewError('当前浏览器不支持流式视频预览。');
      return;
    }

    if (!MediaSource.isTypeSupported(STREAMING_VIDEO_MIME_TYPE)) {
      onPreviewError('当前浏览器不支持该视频预览格式。');
      return;
    }

    const mediaSource = new MediaSource();
    const objectUrl = URL.createObjectURL(mediaSource);
    const controller = new AbortController();
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    let revoked = false;

    setMediaSourceUrl(objectUrl);

    const revoke = () => {
      if (!revoked) {
        revoked = true;
        URL.revokeObjectURL(objectUrl);
      }
    };

    const onSourceOpen = () => {
      mediaSource.removeEventListener('sourceopen', onSourceOpen);

      let sourceBuffer: SourceBuffer;

      try {
        sourceBuffer = mediaSource.addSourceBuffer(STREAMING_VIDEO_MIME_TYPE);
      } catch {
        onPreviewError('视频预览初始化失败。');
        controller.abort();
        revoke();
        return;
      }

      const queue: Uint8Array[] = [];
      let appending = false;
      let streamEnded = false;

      const flushQueue = () => {
        if (appending || sourceBuffer.updating || queue.length === 0) {
          if (streamEnded && !sourceBuffer.updating && mediaSource.readyState === 'open') {
            mediaSource.endOfStream();
          }
          return;
        }

        appending = true;
        sourceBuffer.appendBuffer(queue.shift()!);
      };

      sourceBuffer.addEventListener('updateend', () => {
        appending = false;
        flushQueue();
      });

      sourceBuffer.addEventListener('error', () => {
        controller.abort();
        onPreviewError('视频流写入失败。');
      });

      void (async () => {
        try {
          const response = await fetch(url, {
            signal: controller.signal,
          });

          if (!response.ok || !response.body) {
            throw new Error('视频流请求失败。');
          }

          reader = response.body.getReader();

          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              streamEnded = true;
              flushQueue();
              break;
            }

            if (value) {
              queue.push(value);
              flushQueue();
            }
          }
        } catch (error) {
          if (controller.signal.aborted) {
            return;
          }

          onPreviewError(error instanceof Error ? error.message : '视频预览加载失败。');
        }
      })();
    };

    mediaSource.addEventListener('sourceopen', onSourceOpen);

    return () => {
      controller.abort();
      void reader?.cancel().catch(() => {});
      revoke();
    };
  }, [onPreviewError, url]);

  if (!mediaSourceUrl) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-[#71717b]">
        正在建立视频流...
      </div>
    );
  }

  return (
    <video
      src={mediaSourceUrl}
      controls
      autoPlay
      className="max-h-full w-full rounded bg-black"
      onError={() => onPreviewError('视频预览加载失败。')}
    />
  );
}
