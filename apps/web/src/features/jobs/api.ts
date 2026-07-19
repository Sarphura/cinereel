import { requestJson } from '../../lib/api';
import type { MountJob, ScanJob } from './types';

export interface ManualMovieMountInput {
  bannerPath?: string;
  fanartPath?: string;
  posterPath?: string;
  clearlogoPath?: string;
  nfoPath: string;
  videoPath?: string;
  torrentPath?: string;
}

export async function mountDrive(driveKey: string, targetPath: string) {
  const response = await requestJson<{ data: MountJob }>('/api/mount', {
    method: 'POST',
    body: JSON.stringify({ driveKey, targetPath }),
  });

  return response.data;
}

export async function mountMovieManually(driveKey: string, input: ManualMovieMountInput) {
  const response = await requestJson<{ data: MountJob }>('/api/mount/movie', {
    method: 'POST',
    body: JSON.stringify({ driveKey, ...input }),
  });

  return response.data;
}

export async function getMountJob(jobId: string) {
  const response = await requestJson<{ data: MountJob }>(`/api/mount/${jobId}`);
  return response.data;
}

export async function listMountJobs() {
  const response = await requestJson<{ data: MountJob[] }>('/api/mount');
  return response.data;
}


export async function getScanJob(jobId: string) {
  const response = await requestJson<{ data: ScanJob }>(`/api/scans/${jobId}`);
  return response.data;
}

export async function listScanJobs() {
  const response = await requestJson<{ data: ScanJob[] }>('/api/scans');
  return response.data;
}
