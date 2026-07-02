export type DriveContentType = 'movie' | 'series' | 'music' | 'generic';

export type DriveRecord = {
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
};

export type ResourceTreeNode = {
  path: string;
  name: string;
  type: 'file' | 'directory';
  size: number;
  updatedAt: number;
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
