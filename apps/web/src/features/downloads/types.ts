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
