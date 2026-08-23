import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { DriveRecord } from '../../drive/types';
import { PublishDetailHeader } from './PublishDetailHeader';

const movieDrive: DriveRecord = {
  driveKey: 'movie-drive',
  name: '电影库',
  type: 'movie',
  createdAt: 1,
  updatedAt: 1,
  fileCount: 0,
  totalSize: 0,
  publicationCount: 0,
  peerCount: 0,
  isLocal: true,
};

describe('PublishDetailHeader', () => {
  it.each([
    ['pending', '创建中'],
    ['failed', '创建失败'],
  ] as const)('%s Drive 只显示状态，不提供挂载入口', (status, statusLabel) => {
    render(
      <PublishDetailHeader
        drive={{ ...movieDrive, driveKey: '', status }}
        submitting={false}
        onMount={vi.fn()}
        onManualMovieMount={vi.fn()}
      />,
    );

    expect(screen.getByText(statusLabel)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '手动挂载' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '自动挂载' })).not.toBeInTheDocument();
  });

  it('仅为电影 Drive 拆分手动和自动挂载按钮', () => {
    const props = {
      submitting: false,
      onMount: vi.fn(),
      onManualMovieMount: vi.fn(),
    };
    const { rerender } = render(<PublishDetailHeader {...props} drive={movieDrive} />);

    expect(screen.getByRole('button', { name: '手动挂载' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '自动挂载' })).toBeInTheDocument();

    rerender(<PublishDetailHeader {...props} drive={{ ...movieDrive, type: 'generic' }} />);
    expect(screen.queryByRole('button', { name: '手动挂载' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '挂载' })).toBeInTheDocument();
  });

  it('校验手动挂载表单并提交路径清单', async () => {
    const user = userEvent.setup();
    const onManualMovieMount = vi.fn().mockResolvedValue(undefined);
    render(
      <PublishDetailHeader
        drive={movieDrive}
        submitting={false}
        onMount={vi.fn()}
        onManualMovieMount={onManualMovieMount}
      />,
    );

    await user.click(screen.getByRole('button', { name: '手动挂载' }));
    await user.click(screen.getByRole('button', { name: '确定' }));
    expect(screen.getByText('请先选择 NFO 文件。')).toBeInTheDocument();

    await user.type(screen.getByLabelText('NFO 路径'), '/media/Movie/movie.nfo');
    await user.type(screen.getByLabelText('Poster 路径'), '/media/Movie/cover.jpg');
    await user.type(screen.getByLabelText('电影视频 路径'), '/media/Movie/movie.mkv');
    await user.click(screen.getByRole('button', { name: '确定' }));

    expect(onManualMovieMount).toHaveBeenCalledWith(expect.objectContaining({
      nfoPath: '/media/Movie/movie.nfo',
      posterPath: '/media/Movie/cover.jpg',
      videoPath: '/media/Movie/movie.mkv',
    }));
    expect(screen.queryByText('手动挂载电影')).not.toBeInTheDocument();
  });

  it('自动挂载保持原有目录路径提交行为', async () => {
    const user = userEvent.setup();
    const onMount = vi.fn().mockResolvedValue(undefined);
    render(
      <PublishDetailHeader
        drive={movieDrive}
        submitting={false}
        defaultMountPath="/media/Movies"
        onMount={onMount}
        onManualMovieMount={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: '自动挂载' }));
    await user.click(screen.getByRole('button', { name: '加入任务' }));
    expect(onMount).toHaveBeenCalledWith('/media/Movies');
  });
});
