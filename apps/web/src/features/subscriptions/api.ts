import { queryOptions } from '@tanstack/react-query';
import { requestJson } from '../../lib/api';
import { queryClient } from '../../lib/queryClient';
import type { DriveContentType, DriveExplorerLoaderData, DriveRecord, ResourceTreeNode } from '../../shared/types/drive';
import { filterDrivesByScope, resolveSelectedDriveKey } from '../../shared/utils/drive';

function normalizeDriveRecord(drive: DriveRecord): DriveRecord {
  return {
    ...drive,
    type: drive.type ?? 'generic',
    peerCount: Number.isFinite(drive.peerCount) ? drive.peerCount : 0,
  };
}

export async function listSubscribedDrives() {
  const response = await requestJson<{ data: DriveRecord[] }>('/api/drives');
  return filterDrivesByScope(response.data.map(normalizeDriveRecord), 'subscribed');
}

export async function getSubscribedDriveTree(driveKey: string) {
  const response = await requestJson<{ data: ResourceTreeNode }>(`/api/drives/${driveKey}/tree`);
  return response.data;
}

export async function refreshSubscribedDriveTree(driveKey: string) {
  const response = await requestJson<{ data: ResourceTreeNode }>(`/api/drives/${driveKey}/refresh`, {
    method: 'POST',
  });
  return response.data;
}

export function subscribedDrivesQueryOptions() {
  return queryOptions({
    queryKey: ['drives', 'subscribed'] as const,
    queryFn: listSubscribedDrives,
  });
}

export function subscribedDriveTreeQueryOptions(driveKey: string) {
  return queryOptions({
    queryKey: ['drive-tree', driveKey] as const,
    queryFn: () => getSubscribedDriveTree(driveKey),
  });
}

export async function loadSubscribedExplorerData(requestedDriveKey?: string): Promise<DriveExplorerLoaderData> {
  const drives = await queryClient.ensureQueryData(subscribedDrivesQueryOptions());
  const selectedDriveKey = resolveSelectedDriveKey(drives, requestedDriveKey);
  const resourceTree = selectedDriveKey
    ? await queryClient.ensureQueryData(subscribedDriveTreeQueryOptions(selectedDriveKey))
    : null;

  return {
    drives,
    selectedDriveKey,
    resourceTree,
  };
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
