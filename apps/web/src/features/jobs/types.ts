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
