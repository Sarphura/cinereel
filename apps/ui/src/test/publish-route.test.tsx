import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { queryClient } from '../lib/queryClient';

describe('publish route URL sync', () => {
  beforeEach(() => {
    queryClient.clear();
    window.history.pushState({}, '', '/publish');
  });

  it('updates search params when selecting a drive', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith('/api/drives')) {
        return new Response(JSON.stringify({
          data: [
            { driveKey: 'local-a', name: 'Drive A', type: 'generic', createdAt: 1, updatedAt: 2, fileCount: 0, totalSize: 0, publicationCount: 0, peerCount: 0, isLocal: true },
            { driveKey: 'local-b', name: 'Drive B', type: 'generic', createdAt: 1, updatedAt: 2, fileCount: 0, totalSize: 0, publicationCount: 0, peerCount: 0, isLocal: true },
          ],
        }));
      }

      if (url.endsWith('/api/downloads') || url.endsWith('/api/mount') || url.endsWith('/api/scans')) {
        return new Response(JSON.stringify({ data: [] }));
      }

      if (url.endsWith('/api/profile')) {
        return new Response(JSON.stringify({
          data: {
            driveKey: 'profile-drive',
            name: 'Lynn',
            bio: '',
            avatarPath: null,
            avatarUrl: null,
            updatedAt: 1,
            collections: [],
          },
        }));
      }

      if (url.includes('/api/drives/local-a/tree')) {
        return new Response(JSON.stringify({
          data: { path: '/', name: 'root-a', type: 'directory', size: 0, updatedAt: 1, children: [] },
        }));
      }

      if (url.includes('/api/drives/local-b/tree')) {
        return new Response(JSON.stringify({
          data: { path: '/', name: 'root-b', type: 'directory', size: 0, updatedAt: 1, children: [] },
        }));
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }));

    render(<App />);

    await screen.findAllByText('Drive A');

    const driveItem = screen.getAllByText('Drive B')[0].closest('div.group');

    expect(driveItem).not.toBeNull();

    await userEvent.click(driveItem!);

    await waitFor(() => {
      expect(window.location.search).toContain('driveKey=local-b');
    });
  });
});
