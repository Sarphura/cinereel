import { queryOptions } from '@tanstack/react-query';
import type { DriveContentType, DriveExplorerLoaderData, DriveRecord, DriveScope, DownloadJob, MountJob, MovieRecord, ProfileRecord, ResourceTreeNode, ScanJob, MediaIndexResponse } from './types';
import { queryClient } from '../../lib/queryClient';
import { API_BASE_URL, filterDrivesByScope, resolveSelectedDriveKey } from './utils';

async function requestJson<T>(pathname: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);

  if (init?.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE_URL}${pathname}`, {
    headers,
    ...init,
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error ?? '请求失败。');
  }

  return payload as T;
}

function normalizeDriveRecord(drive: DriveRecord): DriveRecord {
  return {
    ...drive,
    type: drive.type ?? 'generic',
    peerCount: Number.isFinite(drive.peerCount) ? drive.peerCount : 0,
  };
}

function normalizeProfileRecord(profile: ProfileRecord): ProfileRecord {
  return {
    ...profile,
    avatarUrl: profile.avatarUrl
      ? new URL(profile.avatarUrl, `${API_BASE_URL}/`).toString()
      : null,
  };
}

export async function listDrives(scope: DriveScope) {
  const response = await requestJson<{ data: DriveRecord[] }>('/api/drives');
  return filterDrivesByScope(response.data.map(normalizeDriveRecord), scope);
}

export async function getDriveTree(driveKey: string) {
  const response = await requestJson<{ data: ResourceTreeNode }>(`/api/drives/${driveKey}/tree`);
  return response.data;
}

export async function refreshDriveTree(driveKey: string) {
  const response = await requestJson<{ data: ResourceTreeNode }>(`/api/drives/${driveKey}/refresh`, {
    method: 'POST',
  });
  return response.data;
}

export function drivesQueryOptions(scope: DriveScope) {
  return queryOptions({
    queryKey: ['drives', scope] as const,
    queryFn: () => listDrives(scope),
  });
}

export function driveTreeQueryOptions(driveKey: string) {
  return queryOptions({
    queryKey: ['drive-tree', driveKey] as const,
    queryFn: () => getDriveTree(driveKey),
  });
}

export async function loadDriveExplorerData(scope: DriveScope, requestedDriveKey?: string): Promise<DriveExplorerLoaderData> {
  const drives = await queryClient.ensureQueryData(drivesQueryOptions(scope));
  const selectedDriveKey = resolveSelectedDriveKey(drives, requestedDriveKey);
  const resourceTree = selectedDriveKey
    ? await queryClient.ensureQueryData(driveTreeQueryOptions(selectedDriveKey))
    : null;

  return {
    drives,
    selectedDriveKey,
    resourceTree,
  };
}

export async function createOwnedDrive(input: { name: string; type: DriveContentType }) {
  const response = await requestJson<{ data: DriveRecord }>('/api/drives', {
    method: 'POST',
    body: JSON.stringify(input),
  });

  return normalizeDriveRecord(response.data);
}

export async function renameDrive(driveKey: string, name: string) {
  const response = await requestJson<{ data: DriveRecord }>(`/api/drives/${driveKey}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });

  return normalizeDriveRecord(response.data);
}

export async function saveOwnedDriveRemark(driveKey: string, remark: string) {
  const response = await requestJson<{ data: { driveKey: string; remark?: string } }>(`/api/drives/${driveKey}`, {
    method: 'PATCH',
    body: JSON.stringify({ remark }),
  });

  return response.data;
}

export async function deleteDrive(driveKey: string) {
  await requestJson(`/api/drives/${driveKey}`, {
    method: 'DELETE',
  });
}

export async function mountDrive(driveKey: string, targetPath: string) {
  const response = await requestJson<{ data: MountJob }>('/api/mount', {
    method: 'POST',
    body: JSON.stringify({ driveKey, targetPath }),
  });

  return response.data;
}

export async function getMountJob(jobId: string) {
  const response = await requestJson<{ data: MountJob }>(`/api/mount/${jobId}`);
  return response.data;
}

export async function listMountJobs() {
  const response = await requestJson<{ data: MountJob[] }>('/api/mount');
  return response.data;
}

export async function addSubscribedDrive(input: { driveKey: string }) {
  const response = await requestJson<{ data: { driveKey: string; name?: string; type: DriveContentType; createdAt: number } }>('/api/subscribed-drives', {
    method: 'POST',
    body: JSON.stringify(input),
  });

  return response.data;
}

export async function deleteSubscribedDrive(driveKey: string) {
  const response = await requestJson<{ data: { driveKey: string } }>(`/api/subscribed-drives/${driveKey}`, {
    method: 'DELETE',
  });

  return response.data;
}

export async function saveSubscribedDriveRemark(driveKey: string, remark: string) {
  const response = await requestJson<{ data: { driveKey: string; remark?: string } }>(`/api/subscribed-drives/${driveKey}`, {
    method: 'PATCH',
    body: JSON.stringify({ remark }),
  });

  return response.data;
}

export async function createDownloadJob(input: {
  driveKey: string;
  resourcePath: string;
  targetDir: string;
  targetName?: string;
}) {
  const response = await requestJson<{ data: DownloadJob }>('/api/downloads', {
    method: 'POST',
    body: JSON.stringify(input),
  });

  return response.data;
}

export async function getDownloadJob(jobId: string) {
  const response = await requestJson<{ data: DownloadJob }>(`/api/downloads/${jobId}`);
  return response.data;
}

export async function listDownloadJobs() {
  const response = await requestJson<{ data: DownloadJob[] }>('/api/downloads');
  return response.data;
}

export async function getScanJob(jobId: string) {
  const response = await requestJson<{ data: ScanJob }>(`/api/scans/${jobId}`);
  return response.data;
}

export async function listScanJobs() {
  const response = await requestJson<{ data: ScanJob[] }>('/api/scans');
  return response.data;
}

export async function removeDownloadedResource(input: {
  driveKey: string;
  resourcePath: string;
}) {
  await requestJson('/api/downloads', {
    method: 'DELETE',
    body: JSON.stringify(input),
  });
}

export async function getCurrentProfile() {
  const response = await requestJson<{ data: ProfileRecord }>('/api/profile');
  return normalizeProfileRecord(response.data);
}

export async function saveCurrentProfile(input: {
  name?: string;
  bio?: string;
  avatarDataUrl?: string | null;
}) {
  const response = await requestJson<{ data: ProfileRecord }>('/api/profile', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });

  return normalizeProfileRecord(response.data);
}
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
