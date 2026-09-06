import { queryOptions } from '@tanstack/react-query';
import { API_BASE_URL, requestJson } from '../../../lib/api';
import { queryClient } from '../../../lib/queryClient';
import { toDriveContentType } from '../../drive/contentTypes';
import type { DriveContentTypeId, DriveExplorerLoaderData, DriveRecord, DriveStatus, ResourceTreeNode } from '../../drive/types';
import { filterDrivesByScope, getDriveSelectionKey, resolveSelectedDriveKey } from '../../drive/utils';

type DriveResponse = {
  driveId: string;
  driveKey: string | null;
  name: string;
  contentTypeId: string;
  remark: string | null;
  relation: string;
  status: DriveStatus;
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
    driveKey: drive.driveKey ?? '',
    status: drive.status,
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

export async function getPublishedDriveTree(driveId: string) {
  const drives = queryClient.getQueryData<DriveRecord[]>(publishedDrivesQueryOptions().queryKey) ?? [];
  const selectedDrive = drives.find((drive) => (
    getDriveSelectionKey(drive) === driveId
    || drive.driveId === driveId
    || drive.driveKey === driveId
  ));
  const resolvedDriveId = selectedDrive ? getDriveSelectionKey(selectedDrive) : driveId;

  try {
    if (!selectedDrive) {
      return null;
    }

    return await loadDriveDirectoryTree(
      resolvedDriveId,
      '/',
      selectedDrive.name,
      selectedDrive.updatedAt,
    );
  } catch {
    return selectedDrive ? createEmptyDriveTree(selectedDrive) : null;
  }
}

export async function refreshPublishedDriveTree(driveId: string) {
  return getPublishedDriveTree(driveId);
}

type DriveDirectoryResponse = {
  path: string;
  driveVersion: number;
  entries: Array<{
    path: string;
    name: string;
    type: 'file' | 'directory' | 'symlink';
    size: number | null;
  }>;
  nextCursor: string | null;
};

async function loadDriveDirectoryTree(
  driveId: string,
  path: string,
  name: string,
  updatedAt: number,
): Promise<ResourceTreeNode> {
  const entries: DriveDirectoryResponse['entries'] = [];
  let cursor: string | undefined;

  do {
    const search = new URLSearchParams({ path, limit: '500' });
    if (cursor) {
      search.set('cursor', cursor);
    }

    const response = await requestJson<DriveDirectoryResponse>(
      `/api/drives/${driveId}/files/entries?${search.toString()}`,
    );
    entries.push(...response.entries);
    cursor = response.nextCursor ?? undefined;
  } while (cursor);

  const children = await Promise.all(
    entries.map((entry) => {
      if (entry.type === 'directory') {
        return loadDriveDirectoryTree(driveId, entry.path, entry.name, updatedAt);
      }

      return Promise.resolve<ResourceTreeNode>({
        path: entry.path,
        name: entry.name,
        type: 'file',
        size: entry.size ?? 0,
        updatedAt,
        children: [],
      });
    }),
  );

  return {
    path,
    name,
    type: 'directory',
    size: 0,
    updatedAt,
    children,
  };
}

export function publishedDrivesQueryOptions() {
  return queryOptions({
    queryKey: ['drives', 'local'] as const,
    queryFn: listPublishedDrives,
  });
}

export function publishedDriveTreeQueryOptions(driveId: string) {
  return queryOptions({
    queryKey: ['drive-tree', driveId] as const,
    queryFn: () => getPublishedDriveTree(driveId),
  });
}

export async function loadPublishedExplorerData(requestedDriveId?: string): Promise<DriveExplorerLoaderData> {
  const drives = await queryClient.ensureQueryData(publishedDrivesQueryOptions());
  const selectedDriveId = resolveSelectedDriveKey(drives, requestedDriveId);
  const selectedDrive = drives.find((drive) => getDriveSelectionKey(drive) === selectedDriveId);
  const resourceTree = selectedDriveId && (selectedDrive?.status ?? 'ready') === 'ready'
    ? await queryClient.ensureQueryData(publishedDriveTreeQueryOptions(selectedDriveId))
    : null;

  return {
    drives,
    selectedDriveKey: selectedDriveId,
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

export async function renamePublishedDrive(driveId: string, name: string) {
  const response = await requestJson<DriveResponse>(`/api/drives/${driveId}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });

  return normalizeDriveResponse(response);
}

export async function savePublishedDriveRemark(driveId: string, remark: string) {
  await requestJson(`/api/drives/${driveId}/remark`, {
    method: 'PUT',
    body: JSON.stringify({ remark }),
  });
}

export async function retryPublishedDriveCreation(driveId: string) {
  await requestJson(`/api/drives/${driveId}/creation/retry`, {
    method: 'POST',
  });
}

export async function deletePublishedDrive(driveId: string) {
  await requestJson(`/api/drives/${driveId}`, {
    method: 'DELETE',
  });
}

export async function moveDriveFile(driveId: string, from: string, to: string) {
  await requestJson(`/api/drives/${driveId}/files/move`, {
    method: 'POST',
    body: JSON.stringify({ from, to }),
  });
}

export async function copyDriveFile(driveId: string, from: string, to: string) {
  await requestJson(`/api/drives/${driveId}/files/copy`, {
    method: 'POST',
    body: JSON.stringify({ from, to }),
  });
}

export async function createDriveFolder(driveId: string, path: string) {
  await requestJson(`/api/drives/${driveId}/files/folder`, {
    method: 'POST',
    body: JSON.stringify({ path }),
  });
}

export async function deleteDriveFile(driveId: string, path: string) {
  const search = new URLSearchParams({ path });
  await requestJson(`/api/drives/${driveId}/files?${search.toString()}`, {
    method: 'DELETE',
  });
}

export function buildDriveFileDownloadUrl(driveId: string, path: string) {
  const search = new URLSearchParams({ path });
  return `${API_BASE_URL}/api/drives/${encodeURIComponent(driveId)}/files?${search.toString()}`;
}

export function downloadDriveFile(driveId: string, path: string) {
  if (typeof document === 'undefined') {
    return;
  }

  const link = document.createElement('a');
  link.href = buildDriveFileDownloadUrl(driveId, path);
  link.download = '';
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export async function uploadDriveFile(driveId: string, path: string, file: Blob) {
  const search = new URLSearchParams({ path });
  await requestJson(`/api/drives/${driveId}/files?${search.toString()}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/octet-stream',
    },
    body: file,
  });
}

export async function uploadDriveFiles(driveId: string, files: readonly File[]) {
  if (files.length === 0) {
    throw new Error('请选择要上传的文件。');
  }

  const result = await runBatchFileOperation(
    [...files],
    async (file) => uploadDriveFile(driveId, toDriveUploadPath(file), file),
  );

  if (result.failures.length > 0) {
    const firstFailure = result.failures[0];
    throw new Error(
      `上传完成 ${files.length - result.failures.length}/${files.length} 个文件。` +
      ` ${getFileDisplayName(firstFailure.item)}：${firstFailure.error}`,
    );
  }
}

function toDriveUploadPath(file: File) {
  const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
  const segments = relativePath
    .replaceAll('\\', '/')
    .split('/')
    .filter(Boolean);

  if (segments.length === 0 || segments.some((segment) => segment === '.' || segment === '..')) {
    throw new Error(`文件路径无效：${relativePath}`);
  }

  return `/${segments.join('/')}`;
}

function getFileDisplayName(file: File) {
  return (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
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
