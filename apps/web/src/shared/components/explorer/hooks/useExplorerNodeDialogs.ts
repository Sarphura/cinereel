import { useState } from 'react';
import { buildRenamedPath } from '../path-utils';
import type { ExplorerNode } from '../types';

export type RenameDialogState<TNode> = {
  node: TNode;
  value: string;
  error: string | null;
  submitting: boolean;
};

export type NewFolderDialogState<TNode> = {
  parent: TNode;
  value: string;
  error: string | null;
  submitting: boolean;
};

export type DeleteConfirmState<TNode> = {
  nodes: TNode[];
};

/** 管理重命名 / 新建文件夹 / 删除确认三个弹窗的状态与提交逻辑。 */
export function useExplorerNodeDialogs<TNode extends ExplorerNode>({
  onRenameNode,
  onCreateFolder,
  onDeleteNode,
  clearSelection,
  setActionError,
}: {
  onRenameNode?: (node: TNode, newPath: string) => Promise<void>;
  onCreateFolder?: (parentDir: TNode, name: string) => Promise<void>;
  onDeleteNode?: (node: TNode) => Promise<void>;
  clearSelection: () => void;
  setActionError: (message: string | null) => void;
}) {
  const [renameDialog, setRenameDialog] = useState<RenameDialogState<TNode> | null>(null);
  const [newFolderDialog, setNewFolderDialog] = useState<NewFolderDialogState<TNode> | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState<TNode> | null>(null);
  const [deleting, setDeleting] = useState(false);

  const openRenameDialog = (node: TNode) => {
    setRenameDialog({ node, value: node.name, error: null, submitting: false });
  };

  const openNewFolderDialog = (parent: TNode) => {
    setNewFolderDialog({ parent, value: '新建文件夹', error: null, submitting: false });
  };

  const openDeleteConfirm = (nodes: TNode[]) => {
    setDeleteConfirm({ nodes });
  };

  const handleRenameSubmit = async () => {
    if (!renameDialog || !onRenameNode) return;

    const newName = renameDialog.value.trim();
    if (!newName) {
      setRenameDialog((d) => d ? { ...d, error: '名称不能为空' } : null);
      return;
    }
    if (newName === renameDialog.node.name) {
      setRenameDialog(null);
      return;
    }

    const newPath = buildRenamedPath(renameDialog.node.path, newName);
    setRenameDialog((d) => d ? { ...d, submitting: true, error: null } : null);

    try {
      await onRenameNode(renameDialog.node, newPath);
      setRenameDialog(null);
    } catch (err) {
      setRenameDialog((d) => d ? {
        ...d,
        submitting: false,
        error: err instanceof Error ? err.message : '重命名失败',
      } : null);
    }
  };

  const handleCreateFolderSubmit = async () => {
    if (!newFolderDialog || !onCreateFolder) return;

    const name = newFolderDialog.value.trim();
    if (!name) {
      setNewFolderDialog((d) => d ? { ...d, error: '名称不能为空' } : null);
      return;
    }

    setNewFolderDialog((d) => d ? { ...d, submitting: true, error: null } : null);

    try {
      await onCreateFolder(newFolderDialog.parent, name);
      setNewFolderDialog(null);
    } catch (err) {
      setNewFolderDialog((d) => d ? {
        ...d,
        submitting: false,
        error: err instanceof Error ? err.message : '创建失败',
      } : null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirm || !onDeleteNode) return;

    setDeleting(true);
    const failures: string[] = [];

    for (const node of deleteConfirm.nodes) {
      try {
        await onDeleteNode(node);
      } catch (err) {
        failures.push(`${node.name}: ${err instanceof Error ? err.message : '删除失败'}`);
      }
    }

    setDeleting(false);
    setDeleteConfirm(null);
    clearSelection();

    if (failures.length > 0) {
      setActionError(failures.join('；'));
    }
  };

  return {
    renameDialog,
    setRenameDialog,
    newFolderDialog,
    setNewFolderDialog,
    deleteConfirm,
    setDeleteConfirm,
    deleting,
    openRenameDialog,
    openNewFolderDialog,
    openDeleteConfirm,
    handleRenameSubmit,
    handleCreateFolderSubmit,
    handleConfirmDelete,
  };
}
