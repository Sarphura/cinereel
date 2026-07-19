import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { buildNodeMenuItems, type NodeContextMenuState } from './context-menu-items';
import type { ExplorerNode } from './types';

const createNode = (type: ExplorerNode['type']): ExplorerNode => ({
  path: type === 'directory' ? '/movies' : '/movie.mp4',
  name: type === 'directory' ? 'movies' : 'movie.mp4',
  type,
  size: 0,
  createdAt: 0,
  updatedAt: 0,
});

const buildItems = (
  node: ExplorerNode,
  options: Partial<Parameters<typeof buildNodeMenuItems<ExplorerNode>>[0]> = {},
) => {
  const menu: NodeContextMenuState<ExplorerNode> = {
    node,
    paths: [node.path],
    x: 0,
    y: 0,
  };
  const root: ExplorerNode = {
    path: '/',
    name: 'root',
    type: 'directory',
    size: 0,
    createdAt: 0,
    updatedAt: 0,
    children: [node],
  };

  return buildNodeMenuItems({
    menu,
    root,
    clipboard: null,
    onRename: vi.fn(),
    onCopy: vi.fn(),
    onCut: vi.fn(),
    onPaste: vi.fn(),
    onNewFolder: vi.fn(),
    onDelete: vi.fn(),
    ...options,
  });
};

describe('buildNodeMenuItems', () => {
  it('hides unsupported mutation actions for read-only subscription trees', () => {
    const node = createNode('file');
    const items = buildItems(node, {
      onDownloadNode: vi.fn(),
      isDownloadable: () => true,
      onPreviewNode: vi.fn(),
      isPreviewableNode: () => true,
    });

    expect(items.map((item) => item.key)).toEqual(['download', 'preview']);
    expect(items.some((item) => item.disabled)).toBe(false);
  });

  it('offers directory downloads from the context menu', () => {
    const node = createNode('directory');
    const onDownloadNode = vi.fn();
    const items = buildItems(node, { onDownloadNode, isDownloadable: () => true });
    const downloadItem = items.find((item) => item.key === 'download');

    expect(downloadItem?.label).toBe('下载目录');
    downloadItem?.onSelect();
    expect(onDownloadNode).toHaveBeenCalledWith(node);
  });

  it('replaces download with remove for a downloaded resource', () => {
    const node = createNode('file');
    const items = buildItems(node, {
      onDownloadNode: vi.fn(),
      isDownloadable: () => false,
      onRemoveDownloadNode: vi.fn(),
      isDownloadedNode: () => true,
    });

    expect(items.some((item) => item.key === 'download')).toBe(false);
    expect(items.some((item) => item.key === 'remove-download')).toBe(true);
  });

  it('offers preview only for previewable files', () => {
    const node = createNode('file');
    const items = buildItems(node, {
      onPreviewNode: vi.fn(),
      isPreviewableNode: () => true,
    });

    expect(items.some((item) => item.key === 'preview')).toBe(true);
  });
});
