import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { DriveRecord } from '../../drive/types';
import { PublishDetailHeader } from './PublishDetailHeader';

const localDrive: DriveRecord = {
  driveId: '00000000-0000-0000-0000-000000000001',
  driveKey: 'movie-drive-key',
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
  ] as const)('%s Drive 只显示状态，不提供上传入口', (status, statusLabel) => {
    render(
      <PublishDetailHeader
        drive={{ ...localDrive, status }}
        submitting={false}
        onUpload={vi.fn()}
      />,
    );

    expect(screen.getByText(statusLabel)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '上传文件' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '上传目录' })).not.toBeInTheDocument();
  });

  it('为所有可用 Drive 提供上传文件和上传目录入口', () => {
    render(<PublishDetailHeader drive={localDrive} submitting={false} onUpload={vi.fn()} />);

    expect(screen.getByRole('button', { name: '上传文件' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '上传目录' })).toBeInTheDocument();
  });

  it('把文件选择交给上传回调', async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn().mockResolvedValue(undefined);
    const file = new File(['content'], 'movie.mkv', { type: 'video/x-matroska' });
    render(<PublishDetailHeader drive={localDrive} submitting={false} onUpload={onUpload} />);

    await user.upload(screen.getByLabelText('选择上传文件'), file);

    expect(onUpload).toHaveBeenCalledWith([file]);
  });

  it('把目录中的相对路径文件交给上传回调', async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn().mockResolvedValue(undefined);
    const file = new File(['content'], 'movie.mkv', { type: 'video/x-matroska' });
    Object.defineProperty(file, 'webkitRelativePath', { value: 'Movies/movie.mkv' });
    render(<PublishDetailHeader drive={localDrive} submitting={false} onUpload={onUpload} />);

    await user.upload(screen.getByLabelText('选择上传目录'), file);

    expect(onUpload).toHaveBeenCalledWith([file]);
  });
});
