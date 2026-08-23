import type { ExplorerNode } from '../../shared/components/explorer/types';

export type DriveContentType = 'movie' | 'series' | 'music' | 'generic';

export type DriveContentTypeId =
  | 'cinereel.movie'
  | 'cinereel.series'
  | 'cinereel.music'
  | 'cinereel.generic';

export type DriveRecord = {
  driveId?: string;
  driveKey: string;
  name: string;
  type: DriveContentType;
  remark?: string;
  createdAt: number;
  updatedAt: number;
  fileCount: number;
  totalSize: number;
  publicationCount: number;
  peerCount: number;
  isLocal: boolean;
  ownerProfileKey?: string;
};

/**
 * Drive 内的文件/目录节点。继承通用 `ExplorerNode` 的基础结构，并追加
 * Drive 领域特有的本地同步状态字段。
 */
export type ResourceTreeNode = ExplorerNode & {
  localDirPath?: string | null;
  scanStatus?: 'ok' | 'failed' | 'pending' | null;
  scanError?: string | null;
  children?: ResourceTreeNode[];
};

export type DriveScope = 'local' | 'subscribed';

export type DriveExplorerLoaderData = {
  drives: DriveRecord[];
  selectedDriveKey: string | null;
  resourceTree: ResourceTreeNode | null;
  error?: string | null;
};
