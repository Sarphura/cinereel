import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requestJson } from '../../../lib/api';
import { uploadDriveFiles } from './api';

vi.mock('../../../lib/api', () => ({
  requestJson: vi.fn(),
}));

describe('uploadDriveFiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requestJson).mockResolvedValue({});
  });

  it('通过 DriveFile 接口上传单个文件', async () => {
    const file = new File(['content'], 'movie.mkv', { type: 'video/x-matroska' });

    await uploadDriveFiles('drive-id', [file]);

    expect(requestJson).toHaveBeenCalledWith('/api/drives/drive-id/files?path=%2Fmovie.mkv', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
      },
      body: file,
    });
  });

  it('保留目录选择器提供的相对路径', async () => {
    const file = new File(['content'], 'movie.mkv');
    Object.defineProperty(file, 'webkitRelativePath', { value: 'Movies/movie.mkv' });

    await uploadDriveFiles('drive-id', [file]);

    expect(requestJson).toHaveBeenCalledWith('/api/drives/drive-id/files?path=%2FMovies%2Fmovie.mkv', expect.any(Object));
  });

  it('逐个上传并汇总失败文件', async () => {
    const first = new File(['a'], 'first.txt');
    const second = new File(['b'], 'second.txt');
    vi.mocked(requestJson)
      .mockRejectedValueOnce(new Error('目标已存在'))
      .mockResolvedValueOnce({});

    let failure: unknown;
    try {
      await uploadDriveFiles('drive-id', [first, second]);
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe('上传完成 1/2 个文件。 first.txt：目标已存在');
    expect(requestJson).toHaveBeenCalledTimes(2);
  });
});
