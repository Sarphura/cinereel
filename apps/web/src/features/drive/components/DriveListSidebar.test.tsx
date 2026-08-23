import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DriveListSidebar } from './DriveListSidebar';

describe('DriveListSidebar', () => {
  it('renders peerCount instead of publicationCount in the item footer', () => {
    render(
      <DriveListSidebar
        title="订阅源"
        items={[{
          driveKey: 'drive-1',
          name: '远端资源库',
          type: 'generic',
          createdAt: Date.UTC(2026, 2, 15),
          updatedAt: Date.UTC(2026, 2, 15),
          fileCount: 0,
          totalSize: 0,
          publicationCount: 1234,
          peerCount: 7,
          isLocal: false,
        }]}
        selectedDriveKey="drive-1"
        emptyText="empty"
        onSelect={() => {}}
      />,
    );

    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.queryByText('1234')).not.toBeInTheDocument();
  });

  it('renders the drive type label instead of a fixed status label', () => {
    render(
      <DriveListSidebar
        title="订阅源"
        items={[{
          driveKey: 'drive-1',
          name: '远端资源库',
          type: 'movie',
          createdAt: Date.UTC(2026, 2, 15),
          updatedAt: Date.UTC(2026, 2, 15),
          fileCount: 0,
          totalSize: 0,
          publicationCount: 0,
          peerCount: 7,
          isLocal: false,
        }]}
        selectedDriveKey="drive-1"
        emptyText="empty"
        onSelect={() => {}}
      />,
    );

    expect(screen.getByText('电影')).toBeInTheDocument();
    expect(screen.queryByText('正常')).not.toBeInTheDocument();
  });

  it('创建中的 Drive 显示生命周期状态而不是节点数', () => {
    render(
      <DriveListSidebar
        title="本地 Drive"
        items={[{
          driveId: 'pending-drive-id',
          driveKey: '',
          status: 'pending',
          name: '正在创建的资源库',
          type: 'generic',
          createdAt: Date.UTC(2026, 7, 23),
          updatedAt: Date.UTC(2026, 7, 23),
          fileCount: 0,
          totalSize: 0,
          publicationCount: 0,
          peerCount: 7,
          isLocal: true,
        }]}
        selectedDriveKey="pending-drive-id"
        emptyText="empty"
        onSelect={() => {}}
      />,
    );

    expect(screen.getByText('创建中')).toBeInTheDocument();
    expect(screen.queryByText('7')).not.toBeInTheDocument();
  });
});
