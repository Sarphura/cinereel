

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
