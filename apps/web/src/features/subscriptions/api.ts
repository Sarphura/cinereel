import { queryOptions } from '@tanstack/react-query';
import { requestJson } from '../../lib/api';
import { queryClient } from '../../lib/queryClient';
import type { DriveContentType, DriveExplorerLoaderData, DriveRecord, ResourceTreeNode } from '../drive/types';
import { filterDrivesByScope, resolveSelectedDriveKey } from '../drive/utils';

function normalizeDriveRecord(drive: DriveRecord): DriveRecord {
  return {
    ...drive,
    type: drive.type ?? 'generic',
    peerCount: Number.isFinite(drive.peerCount) ? drive.peerCount : 0,
  };
}

export async function listSubscribeDrives() {
  const response = await requestJson<{ data: DriveRecord[] }>('/api/drives');
  return filterDrivesByScope(response.data.map(normalizeDriveRecord), 'subscribed');
}

export async function getSubscribeDriveTree(driveKey: string) {
  const response = await requestJson<{ data: ResourceTreeNode }>(`/api/drives/${driveKey}/tree`);
  return response.data;
}

export async function refreshSubscribeDriveTree(driveKey: string) {
  const response = await requestJson<{ data: ResourceTreeNode }>(`/api/drives/${driveKey}/refresh`, {
    method: 'POST',
  });
  return response.data;
}

export function subscribeDrivesQueryOptions() {
  return queryOptions({
    queryKey: ['drives', 'subscribed'] as const,
    queryFn: listSubscribeDrives,
  });
}

export function subscribeDriveTreeQueryOptions(driveKey: string) {
  return queryOptions({
    queryKey: ['drive-tree', driveKey] as const,
    queryFn: () => getSubscribeDriveTree(driveKey),
  });
}

export async function loadSubscribeExplorerData(requestedDriveKey?: string): Promise<DriveExplorerLoaderData> {
  const drives = await queryClient.ensureQueryData(subscribeDrivesQueryOptions());
  const selectedDriveKey = resolveSelectedDriveKey(drives, requestedDriveKey);
  const resourceTree = selectedDriveKey
    ? await queryClient.ensureQueryData(subscribeDriveTreeQueryOptions(selectedDriveKey))
    : null;

  return {
    drives,
    selectedDriveKey,
    resourceTree,
  };
}

export async function addSubscribe(input: { driveKey: string }) {
  const response = await requestJson<{
    data: {
      driveKey: string
      name?: string
      type: DriveContentType
      createdAt: number
      ownerProfileKey: string
      owner: {
        driveKey: string
        name: string
        bio: string
        avatarPath: string | null
        avatarUrl: string | null
        updatedAt: number
      }
    }
  }>('/api/subscribe', {
    method: 'POST',
    body: JSON.stringify(input),
  });

  return response.data;
}

export async function deleteSubscribe(driveKey: string) {
  const response = await requestJson<{ data: { driveKey: string } }>(`/api/subscribe/${driveKey}`, {
    method: 'DELETE',
  });

  return response.data;
}

export async function saveSubscribeRemark(driveKey: string, remark: string) {
  const response = await requestJson<{ data: { driveKey: string; remark?: string } }>(`/api/subscribe/${driveKey}`, {
    method: 'PATCH',
    body: JSON.stringify({ remark }),
  });

  return response.data;
}
