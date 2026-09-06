import { requestJson } from '../../lib/api';
import type { ScanJob } from './types';

export async function getScanJob(jobId: string) {
  const response = await requestJson<{ data: ScanJob }>(`/api/scans/${jobId}`);
  return response.data;
}

export async function listScanJobs() {
  const response = await requestJson<{ data: ScanJob[] }>('/api/scans');
  return response.data;
}
