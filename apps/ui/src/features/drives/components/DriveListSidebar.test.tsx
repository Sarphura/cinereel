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
});
