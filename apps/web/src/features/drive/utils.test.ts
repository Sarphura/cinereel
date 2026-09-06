import { describe, expect, it } from 'vitest';
import type { DriveRecord } from './types';
import { resolveSelectedDriveKey } from './utils';

const drives: DriveRecord[] = [
  {
    driveId: 'drive-id-1',
    driveKey: 'drive-key-1',
    name: '第一个 Drive',
    type: 'generic',
    createdAt: 1,
    updatedAt: 1,
    fileCount: 0,
    totalSize: 0,
    publicationCount: 0,
    peerCount: 0,
    isLocal: true,
  },
  {
    driveId: 'drive-id-2',
    driveKey: 'drive-key-2',
    name: '第二个 Drive',
    type: 'generic',
    createdAt: 1,
    updatedAt: 1,
    fileCount: 0,
    totalSize: 0,
    publicationCount: 0,
    peerCount: 0,
    isLocal: true,
  },
];

describe('Drive 选择键解析', () => {
  it('将旧 DriveKey 解析为本地 DriveId', () => {
    expect(resolveSelectedDriveKey(drives, 'drive-key-2')).toBe('drive-id-2');
  });

  it('保留已规范化的 DriveId', () => {
    expect(resolveSelectedDriveKey(drives, 'drive-id-2')).toBe('drive-id-2');
  });
});
