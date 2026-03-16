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

export type ScanJob = {
  id: string;
  driveKey: string;
  rootPath: string;
  publicationId: string;
  totalFiles: number;
  processedFiles: number;
  currentFilePath: string | null;
  progress: number;
  status: 'queued' | 'scanning' | 'completed' | 'failed';
  error: string | null;
  failedFiles: Array<{
    path: string;
    fileName: string;
    error: string;
    failedAt: number;
  }>;
  createdAt: number;
  updatedAt: number;
};

export type DriveScope = 'local' | 'subscribed';

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

export interface MediaStreamRecord {
  codec: string | null;
  profile?: string | null;
  language?: string | null;
  title?: string | null;
  bitRate?: number | null;
}

export interface MediaVideoRecord extends MediaStreamRecord {
  width: number | null;
  height: number | null;
  frameRate: number | null;
  level: number | null;
  bitDepth: number | null;
  hdr: string | null;
  colorPrimaries?: string | null;
  colorTransfer?: string | null;
  colorSpace?: string | null;
}

export interface MediaAudioRecord extends MediaStreamRecord {
  channels: number | null;
  channelLayout?: string | null;
  sampleRate?: number | null;
}

export interface MediaSubtitleRecord extends MediaStreamRecord {
  forced?: boolean;
  default?: boolean;
}

export interface MediaIndexEntry {
  path: string;
  fileName: string;
  container: string | null;
  size: number | null;
  durationSeconds: number | null;
  bitRate: number | null;
  video: MediaVideoRecord[];
  audio: MediaAudioRecord[];
  subtitles: MediaSubtitleRecord[];
  scannedAt: number;
  metadata?: MediaMetadataRecord | null;
}

export interface MediaMetadataRecord {
  title?: string | null;
  originalTitle?: string | null;
  plot?: string | null;
  year?: number | null;
  premiered?: string | null;
  rating?: number | null;
  posterPath?: string | null;
  fanartPath?: string | null;
  nfoPath?: string | null;
}

export interface MovieRecord {
  driveKey: string;
  resourcePath: string;
  title?: string;
  originalTitle?: string;
  plot?: string;
  year?: number;
  premiered?: string;
  rating?: number;
  posterPath?: string;
  fanartPath?: string;
  nfoPath?: string;
  indexedAt: number;
}

export interface MediaIndexResponse {
  version: number;
  driveKey: string;
  path: string | null;
  total: number;
  items: MediaIndexEntry[];
}
