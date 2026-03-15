export type DriveRecord = {
  driveKey: string;
  name: string;
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
  children?: ResourceTreeNode[];
};

export type DownloadJob = {
  id: string;
  driveKey: string;
  resourcePath: string;
  targetDir: string;
  targetPath: string;
  kind: 'file' | 'directory';
  fileName: string;
  totalFiles: number;
  downloadedFiles: number;
  totalBytes: number;
  downloadedBytes: number;
  currentFileName: string | null;
  progress: number;
  status: 'queued' | 'downloading' | 'completed' | 'failed';
  error: string | null;
  createdAt: number;
  updatedAt: number;
};

export type MountJob = {
  id: string;
  driveKey: string;
  targetPath: string;
  mountedPath: string | null;
  kind: 'file' | 'directory' | null;
  totalFiles: number;
  processedFiles: number;
  totalBytes: number;
  processedBytes: number;
  currentFilePath: string | null;
  progress: number;
  status: 'queued' | 'mounting' | 'completed' | 'failed';
  error: string | null;
  result: {
    publication: {
      id: string;
    };
  } | null;
  createdAt: number;
  updatedAt: number;
};

export type DriveScope = 'local' | 'subscription';

export type DriveExplorerLoaderData = {
  drives: DriveRecord[];
  selectedDriveKey: string | null;
  resourceTree: ResourceTreeNode | null;
};

export type ProfileRecord = {
  driveKey: string;
  name: string;
  bio: string;
  avatarPath: string | null;
  avatarUrl: string | null;
  updatedAt: number;
  collections: Array<{
    driveKey: string;
    name: string;
    addedAt: number;
    updatedAt: number;
  }>;
};
