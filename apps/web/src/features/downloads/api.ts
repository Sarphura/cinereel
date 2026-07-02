import { requestJson } from '../../lib/api';

import type { DownloadJob } from './types';

export async function createDownloadJob(input: {
  driveKey: string;
  resourcePath: string;
  targetDir: string;
  targetName?: string;
}) {
  const response = await requestJson<{ data: DownloadJob }>('/api/downloads', {
    method: 'POST',
    body: JSON.stringify(input),
  });

  return response.data;
}

export async function getDownloadJob(jobId: string) {
  const response = await requestJson<{ data: DownloadJob }>(`/api/downloads/${jobId}`);
  return response.data;
}

export async function listDownloadJobs() {
  const response = await requestJson<{ data: DownloadJob[] }>('/api/downloads');
  return response.data;
}

export async function removeDownloadedResource(input: {
  driveKey: string;
  resourcePath: string;
}) {
  await requestJson('/api/downloads', {
    method: 'DELETE',
    body: JSON.stringify(input),
  });
}
