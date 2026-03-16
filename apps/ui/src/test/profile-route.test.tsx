import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { queryClient } from '../lib/queryClient';

describe('profile route integration', () => {
  beforeEach(() => {
    queryClient.clear();
    window.history.pushState({}, '', '/profile');
  });

  it('loads profile drive data and routes collections back to publish', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/api/profile') && (!init?.method || init.method === 'GET')) {
        return new Response(JSON.stringify({
          data: {
            driveKey: 'profile-drive',
            name: 'Lynn',
            bio: 'profile drive account',
            avatarPath: null,
            avatarUrl: null,
            updatedAt: 1,
            collections: [
              {
                driveKey: 'local-collection',
                name: '我的合集',
                addedAt: 1,
                updatedAt: 2,
              },
            ],
          },
        }));
      }

      if (url.endsWith('/api/downloads')) {
        return new Response(JSON.stringify({ data: [] }));
      }

      if (url.endsWith('/api/mount')) {
        return new Response(JSON.stringify({ data: [] }));
      }

      if (url.endsWith('/api/scans')) {
        return new Response(JSON.stringify({ data: [] }));
      }

      if (url.endsWith('/api/drives')) {
        return new Response(JSON.stringify({
          data: [
            { driveKey: 'local-collection', name: '我的合集', type: 'generic', createdAt: 1, updatedAt: 2, fileCount: 0, totalSize: 0, publicationCount: 0, peerCount: 0, isLocal: true },
          ],
        }));
      }

      if (url.includes('/api/drives/local-collection/tree')) {
        return new Response(JSON.stringify({
          data: { path: '/', name: '我的合集', type: 'directory', size: 0, updatedAt: 2, children: [] },
        }));
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }));

    render(<App />);

    await screen.findByDisplayValue('Lynn');
    expect(screen.getByText('profile drive account')).toBeInTheDocument();

    await userEvent.click(screen.getByText('我的合集'));

    await waitFor(() => {
      expect(window.location.pathname).toBe('/publish');
      expect(window.location.search).toContain('driveKey=local-collection');
    });
  });

  it('keeps showing the saved avatar returned by the profile api', async () => {
    let profileCallCount = 0;

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/api/profile') && (!init?.method || init.method === 'GET')) {
        profileCallCount += 1;

        return new Response(JSON.stringify({
          data: {
            driveKey: 'profile-drive',
            name: 'Lynn',
            bio: '',
            avatarPath: profileCallCount > 1 ? '/avatar.png' : null,
            avatarUrl: profileCallCount > 1 ? '/api/stream/avatar.png?t=2' : null,
            updatedAt: profileCallCount > 1 ? 2 : 1,
            collections: [],
          },
        }));
      }

      if (url.endsWith('/api/profile') && init?.method === 'PATCH') {
        return new Response(JSON.stringify({
          data: {
            driveKey: 'profile-drive',
            name: 'Lynn',
            bio: '',
            avatarPath: '/avatar.png',
            avatarUrl: '/api/stream/avatar.png?t=2',
            updatedAt: 2,
            collections: [],
          },
        }));
      }

      if (url.endsWith('/api/downloads') || url.endsWith('/api/mount') || url.endsWith('/api/scans')) {
        return new Response(JSON.stringify({ data: [] }));
      }

      if (url.endsWith('/api/drives')) {
        return new Response(JSON.stringify({ data: [] }));
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }));

    render(<App />);

    await screen.findByDisplayValue('Lynn');
    await userEvent.click(screen.getByText('移除头像'));
    await userEvent.click(screen.getByText('保存资料'));

    await waitFor(() => {
      const images = screen.getAllByAltText('Lynn') as HTMLImageElement[];
      expect(images.some((image) => image.src === 'http://localhost:3000/api/stream/avatar.png?t=2')).toBe(true);
    });
  });
});
