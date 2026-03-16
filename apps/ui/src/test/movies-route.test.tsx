import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { queryClient } from '../lib/queryClient';

describe('movies route', () => {
  beforeEach(() => {
    queryClient.clear();
    window.history.pushState({}, '', '/movies');
  });

  it('renders movies from subscribed movie drives', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

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

      if (url.endsWith('/api/movies')) {
        return new Response(JSON.stringify({
          total: 2,
          data: [
            {
              driveKey: 'movie-drive',
              resourcePath: '/Movies/Arrival.2016',
              title: 'Arrival',
              year: 2016,
              posterPath: '/Movies/poster.jpg',
              indexedAt: 10,
            },
            {
              driveKey: 'movie-drive',
              resourcePath: '/Movies/Dune.Part.Two.2024',
              title: 'Dune: Part Two',
              year: 2024,
              posterPath: '/Movies/Dune/poster.jpg',
              indexedAt: 20,
            },
          ],
        }));
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }));

    render(<App />);

    expect((await screen.findAllByText('Dune: Part Two')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Arrival').length).toBeGreaterThan(0);
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByAltText('Dune: Part Two')).toBeInTheDocument();
  });
});
