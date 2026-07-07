import React from 'react';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { FormDialog } from '../../../components/ui/FormDialog';
import type { DeleteConfirmState, NewFolderDialogState, RenameDialogState } from './hooks/useExplorerNodeDialogs';
import type { ExplorerNode } from './types';

export function ExplorerNodeDialogs<TNode extends ExplorerNode>({
  renameDialog,
  newFolderDialog,
  deleteConfirm,
  deleting,
  getRenameDescription,
  onRenameDialogChange,
  onNewFolderDialogChange,
  onDeleteConfirmChange,
  onRenameSubmit,
  onCreateFolderSubmit,
  onConfirmDelete,
}: {
  renameDialog: RenameDialogState<TNode> | null;
  newFolderDialog: NewFolderDialogState<TNode> | null;
  deleteConfirm: DeleteConfirmState<TNode> | null;
  deleting: boolean;
  getRenameDescription?: (node: TNode) => string | undefined;
  onRenameDialogChange: (state: RenameDialogState<TNode> | null | ((state: RenameDialogState<TNode> | null) => RenameDialogState<TNode> | null)) => void;
  onNewFolderDialogChange: (state: NewFolderDialogState<TNode> | null | ((state: NewFolderDialogState<TNode> | null) => NewFolderDialogState<TNode> | null)) => void;
  onDeleteConfirmChange: (state: DeleteConfirmState<TNode> | null) => void;
  onRenameSubmit: () => void | Promise<void>;
  onCreateFolderSubmit: () => void | Promise<void>;
  onConfirmDelete: () => void | Promise<void>;
}) {
  return (
    <>
      <FormDialog
        open={renameDialog !== null}
        title="重命名"
        description={renameDialog ? getRenameDescription?.(renameDialog.node) : undefined}
        label={renameDialog?.node.type === 'directory' ? '新目录名' : '新文件名'}
        value={renameDialog?.value ?? ''}
        placeholder="输入新名称"
        submitLabel="重命名"
        submittingLabel="重命名中..."
        error={renameDialog?.error ?? null}
        disabled={renameDialog?.submitting ?? false}
        onClose={() => onRenameDialogChange(null)}
        onChange={(value) => onRenameDialogChange((state) => (state ? { ...state, value, error: null } : null))}
        onSubmit={() => void onRenameSubmit()}
      />

      <FormDialog
        open={newFolderDialog !== null}
        title="新建文件夹"
        description={newFolderDialog ? `将在"${newFolderDialog.parent.name === '/' ? '根目录' : newFolderDialog.parent.name}"下创建` : undefined}
        label="文件夹名称"
        value={newFolderDialog?.value ?? ''}
        placeholder="输入文件夹名称"
        submitLabel="创建"
        submittingLabel="创建中..."
        error={newFolderDialog?.error ?? null}
        disabled={newFolderDialog?.submitting ?? false}
        onClose={() => onNewFolderDialogChange(null)}
        onChange={(value) => onNewFolderDialogChange((state) => (state ? { ...state, value, error: null } : null))}
        onSubmit={() => void onCreateFolderSubmit()}
      />

      <ConfirmDialog
        open={deleteConfirm !== null}
        title="删除确认"
        description={deleteConfirm
          ? deleteConfirm.nodes.length > 1
            ? `确定删除选中的 ${deleteConfirm.nodes.length} 项吗？此操作无法撤销。`
            : `确定删除"${deleteConfirm.nodes[0]?.name}"吗？此操作无法撤销。`
          : ''
        }
        confirmLabel="删除"
        confirmingLabel="删除中..."
        disabled={deleting}
        onClose={() => onDeleteConfirmChange(null)}
        onConfirm={() => void onConfirmDelete()}
      />
    </>
  );
}
