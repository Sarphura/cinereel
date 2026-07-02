import { queryOptions } from '@tanstack/react-query';
import { requestJson } from '../../../lib/api';
import { queryClient } from '../../../lib/queryClient';
import type { DriveContentType, DriveExplorerLoaderData, DriveRecord, ResourceTreeNode } from '../../../shared/types/drive';
import { filterDrivesByScope, resolveSelectedDriveKey } from '../../../shared/utils/drive';

function normalizeDriveRecord(drive: DriveRecord): DriveRecord {
  return {
    ...drive,
    type: drive.type ?? 'generic',
    peerCount: Number.isFinite(drive.peerCount) ? drive.peerCount : 0,
  };
}

export async function listPublishedDrives() {
  const response = await requestJson<{ data: DriveRecord[] }>('/api/drives');
  return filterDrivesByScope(response.data.map(normalizeDriveRecord), 'local');
}

export async function getPublishedDriveTree(driveKey: string) {
  const response = await requestJson<{ data: ResourceTreeNode }>(`/api/drives/${driveKey}/tree`);
  return response.data;
}

export async function refreshPublishedDriveTree(driveKey: string) {
  const response = await requestJson<{ data: ResourceTreeNode }>(`/api/drives/${driveKey}/refresh`, {
    method: 'POST',
  });
  return response.data;
}

export function publishedDrivesQueryOptions() {
  return queryOptions({
    queryKey: ['drives', 'local'] as const,
    queryFn: listPublishedDrives,
  });
}

export function publishedDriveTreeQueryOptions(driveKey: string) {
  return queryOptions({
    queryKey: ['drive-tree', driveKey] as const,
    queryFn: () => getPublishedDriveTree(driveKey),
  });
}

export async function loadPublishedExplorerData(requestedDriveKey?: string): Promise<DriveExplorerLoaderData> {
  const drives = await queryClient.ensureQueryData(publishedDrivesQueryOptions());
  const selectedDriveKey = resolveSelectedDriveKey(drives, requestedDriveKey);
  const resourceTree = selectedDriveKey
    ? await queryClient.ensureQueryData(publishedDriveTreeQueryOptions(selectedDriveKey))
    : null;

  return {
    drives,
    selectedDriveKey,
    resourceTree,
  };
}

export async function createPublishedDrive(input: { name: string; type: DriveContentType }) {
  const response = await requestJson<{ data: DriveRecord }>('/api/drives', {
    method: 'POST',
    body: JSON.stringify(input),
  });

  return normalizeDriveRecord(response.data);
}

export async function renamePublishedDrive(driveKey: string, name: string) {
  const response = await requestJson<{ data: DriveRecord }>(`/api/drives/${driveKey}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });

  return normalizeDriveRecord(response.data);
}

export async function savePublishedDriveRemark(driveKey: string, remark: string) {
  const response = await requestJson<{ data: { driveKey: string; remark?: string } }>(`/api/drives/${driveKey}`, {
    method: 'PATCH',
    body: JSON.stringify({ remark }),
  });

  return response.data;
}

export async function deletePublishedDrive(driveKey: string) {
  await requestJson(`/api/drives/${driveKey}`, {
    method: 'DELETE',
  });
}
