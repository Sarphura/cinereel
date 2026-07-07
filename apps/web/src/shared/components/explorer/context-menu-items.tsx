import React from 'react';
import {
  IconClipboardPaste,
  IconCopy,
  IconDownload,
  IconFolderPlus,
  IconPencil,
  IconScissors,
  IconTrash,
} from '../../../components/icons/Icons';
import type { ContextMenuItem } from '../../../components/ui/ContextMenu';
import { findNodeByPath } from './path-utils';
import type { ExplorerNode } from './types';
import type { ClipboardState } from './hooks/useExplorerClipboard';

export type NodeContextMenuState<TNode> = {
  node: TNode;
  /** 打开菜单时生效的选区路径（右键命中已选中项时为整个选区，否则为单项） */
  paths: string[];
  x: number;
  y: number;
};

export type RootContextMenuState = {
  x: number;
  y: number;
};

export function buildNodeMenuItems<TNode extends ExplorerNode>({
  menu,
  root,
  clipboard,
  onDownloadNode,
  onRenameNode,
  onCopyNode,
  onMoveNode,
  onCreateFolder,
  onDeleteNode,
  onRename,
  onCopy,
  onCut,
  onPaste,
  onNewFolder,
  onDelete,
}: {
  menu: NodeContextMenuState<TNode>;
  root?: TNode | null;
  clipboard: ClipboardState | null;
  onDownloadNode?: (node: TNode) => void;
  onRenameNode?: (node: TNode, newPath: string) => Promise<void>;
  onCopyNode?: (node: TNode, targetDir: TNode) => Promise<void>;
  onMoveNode?: (node: TNode, targetDir: TNode) => Promise<void>;
  onCreateFolder?: (parentDir: TNode, name: string) => Promise<void>;
  onDeleteNode?: (node: TNode) => Promise<void>;
  onRename: (node: TNode) => void;
  onCopy: (paths: string[]) => void;
  onCut: (paths: string[]) => void;
  onPaste: (targetDir: TNode) => void;
  onNewFolder: (parent: TNode) => void;
  onDelete: (nodes: TNode[]) => void;
}): ContextMenuItem[] {
  const nodes = menu.paths
    .map((path) => findNodeByPath(root, path))
    .filter((node): node is TNode => node !== null);
  const isBatch = nodes.length > 1;
  const items: ContextMenuItem[] = [];

  if (!isBatch) {
    items.push({
      key: 'rename',
      label: '重命名',
      icon: <IconPencil className="size-3.5" />,
      disabled: !onRenameNode,
      onSelect: () => onRename(menu.node),
    });
  }

  items.push({
    key: 'copy',
    label: isBatch ? `复制 ${nodes.length} 项` : '复制',
    icon: <IconCopy className="size-3.5" />,
    disabled: !onCopyNode || nodes.length === 0,
    onSelect: () => onCopy(nodes.map((node) => node.path)),
  });

  items.push({
    key: 'cut',
    label: isBatch ? `剪切 ${nodes.length} 项` : '剪切',
    icon: <IconScissors className="size-3.5" />,
    disabled: !onMoveNode || nodes.length === 0,
    onSelect: () => onCut(nodes.map((node) => node.path)),
  });

  if (menu.node.type === 'directory') {
    items.push({
      key: 'paste',
      label: '粘贴',
      icon: <IconClipboardPaste className="size-3.5" />,
      disabled: !clipboard || (!onCopyNode && !onMoveNode),
      onSelect: () => onPaste(menu.node),
    });
    items.push({
      key: 'new-folder',
      label: '新建文件夹',
      icon: <IconFolderPlus className="size-3.5" />,
      disabled: !onCreateFolder,
      onSelect: () => onNewFolder(menu.node),
    });
  }

  if (!isBatch && menu.node.type === 'file') {
    items.push({
      key: 'download',
      label: '下载',
      icon: <IconDownload className="size-3.5" />,
      disabled: !onDownloadNode,
      onSelect: () => onDownloadNode?.(menu.node),
    });
  }

  items.push({
    key: 'delete',
    label: isBatch ? `删除 ${nodes.length} 项` : '删除',
    icon: <IconTrash className="size-3.5" />,
    danger: true,
    disabled: !onDeleteNode || nodes.length === 0,
    onSelect: () => onDelete(nodes),
  });

  return items;
}

export function buildRootMenuItems<TNode extends ExplorerNode>({
  root,
  clipboard,
  onCopyNode,
  onMoveNode,
  onCreateFolder,
  onPaste,
  onNewFolder,
}: {
  root?: TNode | null;
  clipboard: ClipboardState | null;
  onCopyNode?: (node: TNode, targetDir: TNode) => Promise<void>;
  onMoveNode?: (node: TNode, targetDir: TNode) => Promise<void>;
  onCreateFolder?: (parentDir: TNode, name: string) => Promise<void>;
  onPaste: (targetDir: TNode) => void;
  onNewFolder: (parent: TNode) => void;
}): ContextMenuItem[] {
  if (!root) return [];

  return [
    {
      key: 'new-folder',
      label: '新建文件夹',
      icon: <IconFolderPlus className="size-3.5" />,
      disabled: !onCreateFolder,
      onSelect: () => onNewFolder(root),
    },
    {
      key: 'paste',
      label: '粘贴',
      icon: <IconClipboardPaste className="size-3.5" />,
      disabled: !clipboard || (!onCopyNode && !onMoveNode),
      onSelect: () => onPaste(root),
    },
  ];
}
