import { describe, expect, it, vi } from 'vitest';
import { getCurrentProfile } from './api';

describe('getCurrentProfile', () => {
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
