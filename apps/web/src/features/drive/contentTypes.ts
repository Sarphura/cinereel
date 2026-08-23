import type { DriveContentType, DriveContentTypeId } from './types';

export const DRIVE_CONTENT_TYPES = [
  { type: 'movie', contentTypeId: 'cinereel.movie', label: '电影' },
  { type: 'series', contentTypeId: 'cinereel.series', label: '剧集' },
  { type: 'music', contentTypeId: 'cinereel.music', label: '音乐' },
  { type: 'generic', contentTypeId: 'cinereel.generic', label: '未分类' },
] as const satisfies ReadonlyArray<{
  type: DriveContentType;
  contentTypeId: DriveContentTypeId;
  label: string;
}>;

export function toDriveContentType(contentTypeId: string): DriveContentType {
  return DRIVE_CONTENT_TYPES.find((item) => item.contentTypeId === contentTypeId)?.type ?? 'generic';
}

export function getDriveTypeLabel(type: DriveContentType) {
  return DRIVE_CONTENT_TYPES.find((item) => item.type === type)?.label ?? '未分类';
}
