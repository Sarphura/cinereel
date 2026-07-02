import { queryOptions } from '@tanstack/react-query';
import { requestJson } from '../../lib/api';
import type { MediaIndexResponse, MovieRecord } from './types';

export async function getDriveMediaIndex(driveKey: string, resourcePath?: string) {
  const url = resourcePath 
    ? `/api/drives/${driveKey}/media-index?path=${encodeURIComponent(resourcePath)}`
    : `/api/drives/${driveKey}/media-index`;
  const response = await requestJson<{ data: MediaIndexResponse }>(url);
  return response.data;
}

export function mediaIndexQueryOptions(driveKey: string, resourcePath?: string) {
  return queryOptions({
    queryKey: ['media-index', driveKey, resourcePath] as const,
    queryFn: () => getDriveMediaIndex(driveKey, resourcePath),
  });
}

export async function listMovies() {
  const response = await requestJson<{ data: MovieRecord[] }>('/api/movies');
  return response.data;
}

export function moviesQueryOptions() {
  return queryOptions({
    queryKey: ['movies'] as const,
    queryFn: listMovies,
  });
}
