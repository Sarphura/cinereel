import { queryOptions } from '@tanstack/react-query';
import { requestJson } from '../../../lib/api';
import { queryClient } from '../../../lib/queryClient';
import type { DriveContentType, DriveExplorerLoaderData, DriveRecord, ResourceTreeNode } from '../../drive/types';
import { filterDrivesByScope, resolveSelectedDriveKey } from '../../drive/utils';

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

export async function moveDriveFile(driveKey: string, from: string, to: string) {
  await requestJson(`/api/drives/${driveKey}/files/move`, {
    method: 'POST',
    body: JSON.stringify({ from, to }),
  });
}

export async function copyDriveFile(driveKey: string, from: string, to: string) {
  await requestJson(`/api/drives/${driveKey}/files/copy`, {
    method: 'POST',
    body: JSON.stringify({ from, to }),
  });
}

export async function createDriveFolder(driveKey: string, path: string) {
  await requestJson(`/api/drives/${driveKey}/files/folder`, {
    method: 'POST',
    body: JSON.stringify({ path }),
  });
}

export async function deleteDriveFile(driveKey: string, path: string) {
  await requestJson(`/api/drives/${driveKey}/files`, {
    method: 'DELETE',
    body: JSON.stringify({ path }),
  });
}

/**
 * 批量执行文件操作，逐个串行调用单文件 API 以隔离单项失败，
 * 并在结束后返回失败列表供调用方展示汇总错误。
 */
export async function runBatchFileOperation<T>(
  items: T[],
  operation: (item: T) => Promise<void>,
): Promise<{ failures: Array<{ item: T; error: string }> }> {
  const failures: Array<{ item: T; error: string }> = [];

  for (const item of items) {
    try {
      await operation(item);
    } catch (err) {
      failures.push({ item, error: err instanceof Error ? err.message : '操作失败' });
    }
  }

  return { failures };
}
