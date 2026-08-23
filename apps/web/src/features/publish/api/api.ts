import { queryOptions } from '@tanstack/react-query';
import { requestJson } from '../../../lib/api';
import { queryClient } from '../../../lib/queryClient';
import { toDriveContentType } from '../../drive/contentTypes';
import type { DriveContentTypeId, DriveExplorerLoaderData, DriveRecord, ResourceTreeNode } from '../../drive/types';
import { filterDrivesByScope, resolveSelectedDriveKey } from '../../drive/utils';

type DriveResponse = {
  driveId: string;
  driveKey: string;
  name: string;
  contentTypeId: string;
  remark: string | null;
  relation: string;
  createdAt: string;
  updatedAt: string;
};

function toTimestamp(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function createEmptyDriveTree(drive: DriveRecord): ResourceTreeNode {
  return {
    path: '/',
    name: drive.name,
    type: 'directory',
    size: 0,
    updatedAt: drive.updatedAt,
    children: [],
  };
}

function createIdempotencyKey() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `web:${crypto.randomUUID()}`;
  }

  return `web:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
}

function normalizeDriveResponse(drive: DriveResponse): DriveRecord {
  return {
    driveId: drive.driveId,
    driveKey: drive.driveKey,
    name: drive.name,
    type: toDriveContentType(drive.contentTypeId),
    remark: drive.remark ?? undefined,
    createdAt: toTimestamp(drive.createdAt),
    updatedAt: toTimestamp(drive.updatedAt),
    fileCount: 0,
    totalSize: 0,
    publicationCount: 0,
    peerCount: 0,
    isLocal: drive.relation === 'ownership',
  };
}

export async function listPublishedDrives() {
  const response = await requestJson<DriveResponse[]>('/api/drives');
  return filterDrivesByScope(response.map(normalizeDriveResponse), 'local');
}

export async function getPublishedDriveTree(driveKey: string) {
  const drives = queryClient.getQueryData<DriveRecord[]>(publishedDrivesQueryOptions().queryKey) ?? [];
  const selectedDrive = drives.find((drive) => (drive.driveId ?? drive.driveKey) === driveKey);

  try {
    const response = await requestJson<ResourceTreeNode>(`/api/drives/${driveKey}/tree`);
    return response;
  } catch {
    return selectedDrive ? createEmptyDriveTree(selectedDrive) : null;
  }
}

export async function refreshPublishedDriveTree(driveKey: string) {
  const drives = queryClient.getQueryData<DriveRecord[]>(publishedDrivesQueryOptions().queryKey) ?? [];
  const selectedDrive = drives.find((drive) => (drive.driveId ?? drive.driveKey) === driveKey);

  try {
    const response = await requestJson<ResourceTreeNode>(`/api/drives/${driveKey}/refresh`, {
      method: 'POST',
    });
    return response;
  } catch {
    return selectedDrive ? createEmptyDriveTree(selectedDrive) : null;
  }
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

export async function createPublishedDrive(input: { name: string; contentTypeId: DriveContentTypeId }) {
  const response = await requestJson<DriveResponse>('/api/drives', {
    method: 'POST',
    headers: {
      'Idempotency-Key': createIdempotencyKey(),
    },
    body: JSON.stringify({
      name: input.name,
      contentTypeId: input.contentTypeId,
    }),
  });

  return normalizeDriveResponse(response);
}

export async function renamePublishedDrive(driveKey: string, name: string) {
  const response = await requestJson<DriveResponse>(`/api/drives/${driveKey}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });

  return normalizeDriveResponse(response);
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
