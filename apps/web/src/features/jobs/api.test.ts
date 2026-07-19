import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requestJson } from '../../lib/api';
import { mountMovieManually } from './api';

vi.mock('../../lib/api', () => ({
  requestJson: vi.fn(),
}));

describe('mountMovieManually', () => {
  beforeEach(() => {
    vi.mocked(requestJson).mockResolvedValue({ data: { id: 'job-1' } });
  });

  it('向电影手动挂载接口发送 Drive 和文件路径', async () => {
    await mountMovieManually('movie-drive', {
      nfoPath: '/media/movie/movie.nfo',
      posterPath: '/media/movie/poster.jpg',
      torrentPath: '/media/movie/movie.torrent',
    });

    expect(requestJson).toHaveBeenCalledWith('/api/mount/movie', {
      method: 'POST',
      body: JSON.stringify({
        driveKey: 'movie-drive',
        nfoPath: '/media/movie/movie.nfo',
        posterPath: '/media/movie/poster.jpg',
        torrentPath: '/media/movie/movie.torrent',
      }),
    });
  });
});
