import type { DriveContentType, DriveRecord, DriveScope, ResourceTreeNode } from './types';
import { API_BASE_URL } from '../../lib/api';

export type PreviewKind = 'image' | 'pdf' | 'audio' | 'video';

const STREAMING_VIDEO_PREVIEW_EXTENSIONS = new Set(['mkv']);

const DATE_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function formatDate(value: number) {
  return DATE_FORMATTER.format(value).replace(/\//g, '-');
}

export function formatBytes(size: number) {
  if (size <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let current = size;
  let unitIndex = 0;

  while (current >= 1024 && unitIndex < units.length - 1) {
    current /= 1024;
    unitIndex += 1;
  }

  const digits = current >= 100 || unitIndex === 0 ? 0 : 1;
  return `${current.toFixed(digits)} ${units[unitIndex]}`;
}

const DRIVE_TYPE_LABELS: Record<DriveContentType, string> = {
  movie: '电影',
  series: '剧集',
  music: '音乐',
  generic: '未分类',
};

export function getDriveTypeLabel(type: DriveContentType) {
  return DRIVE_TYPE_LABELS[type];
}

export function getPreviewKind(node: ResourceTreeNode): PreviewKind | null {
  if (node.type !== 'file' || !node.localDirPath) {
    return null;
  }

  const extension = node.name.split('.').pop()?.toLowerCase();

  if (!extension) {
    return null;
  }

  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(extension)) {
    return 'image';
  }

  if (extension === 'pdf') {
    return 'pdf';
  }

  if (['mp3', 'flac', 'wav', 'aac', 'ogg', 'm4a'].includes(extension)) {
    return 'audio';
  }

  if (['mp4', 'mkv', 'mov', 'avi', 'webm', 'm4v'].includes(extension)) {
    return 'video';
  }

  return null;
}

export function buildPreviewUrl(driveKey: string, resourcePath: string) {
  const query = new URLSearchParams({ resourcePath });
  return `${API_BASE_URL}/api/drives/${driveKey}/preview?${query.toString()}`;
}

export function requiresStreamingVideoPreview(resourceName: string) {
  const extension = resourceName.split('.').pop()?.toLowerCase();
  return extension ? STREAMING_VIDEO_PREVIEW_EXTENSIONS.has(extension) : false;
}

export function filterDrivesByScope(drives: DriveRecord[], scope: DriveScope) {
  return drives.filter((drive) => (scope === 'local' ? drive.isLocal : !drive.isLocal));
}

export function resolveSelectedDriveKey(drives: DriveRecord[], requestedDriveKey?: string) {
  if (requestedDriveKey && drives.some((drive) => drive.driveKey === requestedDriveKey)) {
    return requestedDriveKey;
  }

  return drives[0]?.driveKey ?? null;
}

/** 判断该节点是否可下载：尚未同步到本地目录的文件才需要下载。 */
export function isDriveNodeDownloadable(node: ResourceTreeNode) {
  return !node.localDirPath;
}
