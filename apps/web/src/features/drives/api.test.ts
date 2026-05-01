import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCurrentProfile, loadDriveExplorerData } from './api';
import { queryClient } from '../../lib/queryClient';

describe('loadDriveExplorerData', () => {
  beforeEach(() => {
    queryClient.clear();
  });

  it('loads drives and selected tree from cache-backed query client', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith('/api/drives')) {
        return new Response(JSON.stringify({
          data: [
            { driveKey: 'local-a', name: 'A', type: 'generic', createdAt: 1, updatedAt: 2, fileCount: 0, totalSize: 0, publicationCount: 0, peerCount: 0, isLocal: true },
            { driveKey: 'local-b', name: 'B', type: 'generic', createdAt: 1, updatedAt: 2, fileCount: 0, totalSize: 0, publicationCount: 0, peerCount: 0, isLocal: true },
          ],
        }));
      }

      if (url.includes('/api/drives/local-b/tree')) {
        return new Response(JSON.stringify({
          data: { path: '/', name: 'root', type: 'directory', size: 0, updatedAt: 1, children: [] },
        }));
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    const first = await loadDriveExplorerData('local', 'local-b');
    const second = await loadDriveExplorerData('local', 'local-b');

    expect(first.selectedDriveKey).toBe('local-b');
    expect(first.resourceTree?.name).toBe('root');
    expect(second.selectedDriveKey).toBe('local-b');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('normalizes relative avatar urls against the API base url', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith('/api/profile')) {
        return new Response(JSON.stringify({
          data: {
            driveKey: 'profile-drive',
            name: 'Lynn',
            bio: '',
            avatarPath: '/avatar.png',
            avatarUrl: '/api/stream/avatar.png?t=1',
            updatedAt: 1,
            collections: [],
          },
        }));
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }));

    const profile = await getCurrentProfile();

    expect(profile.avatarUrl).toBe('http://localhost:3000/api/stream/avatar.png?t=1');
  });
});
