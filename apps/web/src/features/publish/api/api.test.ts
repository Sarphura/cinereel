import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requestJson } from '../../../lib/api';
import { buildDriveFileDownloadUrl, downloadDriveFile, uploadDriveFiles } from './api';

vi.mock('../../../lib/api', () => ({
  API_BASE_URL: '',
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

describe('downloadDriveFile', () => {
  it('构造 DriveFile 下载地址并触发浏览器原生下载', () => {
    expect(buildDriveFileDownloadUrl(
      '00000000-0000-0000-0000-000000000001',
      '/电影/正片 &=.mkv',
    )).toBe(
      '/api/drives/00000000-0000-0000-0000-000000000001/files?path=%2F%E7%94%B5%E5%BD%B1%2F%E6%AD%A3%E7%89%87+%26%3D.mkv',
    );

    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click');
    downloadDriveFile('00000000-0000-0000-0000-000000000001', '/movie.mkv');

    expect(click).toHaveBeenCalledOnce();
    expect(click.mock.instances[0]).toBeInstanceOf(HTMLAnchorElement);
    expect((click.mock.instances[0] as HTMLAnchorElement).href).toContain(
      '/api/drives/00000000-0000-0000-0000-000000000001/files?path=%2Fmovie.mkv',
    );
    expect((click.mock.instances[0] as HTMLAnchorElement).download).toBe('');
    click.mockRestore();
  });
});
