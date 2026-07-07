import { useEffect } from 'react';
import { findNodeByPath, getParentPath } from '../path-utils';
import type { ExplorerNode } from '../types';
import type { ClipboardState } from './useExplorerClipboard';

/** 键盘快捷键：F2 重命名、Delete 删除、Cmd/Ctrl+C/X/V 复制剪切粘贴、Cmd/Ctrl+A 全选、Esc 取消选中 */
export function useExplorerKeyboardShortcuts<TNode extends ExplorerNode>({
  root,
  selectedPaths,
  setSelectedPaths,
  anchorPath,
  clipboard,
  setClipboard,
  isDialogOpen,
  onRenameNode,
  onDeleteNode,
  openRenameDialog,
  openDeleteConfirm,
  handlePaste,
  getVisiblePaths,
  clearSelection,
}: {
  root?: TNode | null;
  selectedPaths: Set<string>;
  setSelectedPaths: (paths: Set<string>) => void;
  anchorPath: string | null;
  clipboard: ClipboardState | null;
  setClipboard: (clipboard: ClipboardState | null) => void;
  isDialogOpen: boolean;
  onRenameNode?: (node: TNode, newPath: string) => Promise<void>;
  onDeleteNode?: (node: TNode) => Promise<void>;
  openRenameDialog: (node: TNode) => void;
  openDeleteConfirm: (nodes: TNode[]) => void;
  handlePaste: (targetDir: TNode) => void | Promise<void>;
  getVisiblePaths: () => string[];
  clearSelection: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditableTarget = Boolean(
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable),
      );
      if (isEditableTarget || isDialogOpen) {
        return;
      }

      if (event.key === 'Escape') {
        if (selectedPaths.size > 0) {
          clearSelection();
        }
        return;
      }

      if (!root) {
        return;
      }

      const isMeta = event.metaKey || event.ctrlKey;

      // 粘贴不要求已有选中项：默认粘贴到当前锚点所在目录，否则粘贴到根目录。
      if (isMeta && event.key.toLowerCase() === 'v') {
        if (!clipboard) return;
        event.preventDefault();
        const anchor = anchorPath ?? Array.from(selectedPaths)[0] ?? null;
        const anchorNode = anchor ? findNodeByPath(root, anchor) : null;
        const targetDir = anchorNode
          ? (anchorNode.type === 'directory' ? anchorNode : findNodeByPath(root, getParentPath(anchorNode.path)))
          : root;
        if (targetDir) void handlePaste(targetDir);
        return;
      }

      if (selectedPaths.size === 0) {
        return;
      }

      if (event.key === 'F2') {
        if (selectedPaths.size !== 1) return;
        const node = findNodeByPath(root, Array.from(selectedPaths)[0]);
        if (node && onRenameNode) {
          event.preventDefault();
          openRenameDialog(node);
        }
        return;
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        const nodes = Array.from(selectedPaths)
          .map((path) => findNodeByPath(root, path))
          .filter((node): node is TNode => node !== null);
        if (nodes.length > 0 && onDeleteNode) {
          event.preventDefault();
          openDeleteConfirm(nodes);
        }
        return;
      }

      if (isMeta && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        setClipboard({ mode: 'copy', paths: Array.from(selectedPaths) });
        return;
      }

      if (isMeta && event.key.toLowerCase() === 'x') {
        event.preventDefault();
        setClipboard({ mode: 'cut', paths: Array.from(selectedPaths) });
        return;
      }

      if (isMeta && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        setSelectedPaths(new Set(getVisiblePaths()));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    selectedPaths,
    anchorPath,
    root,
    isDialogOpen,
    clipboard,
    onRenameNode,
    onDeleteNode,
    clearSelection,
    setClipboard,
    setSelectedPaths,
    openRenameDialog,
    openDeleteConfirm,
    handlePaste,
    getVisiblePaths,
  ]);
}
