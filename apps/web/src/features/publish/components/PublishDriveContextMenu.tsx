import React from 'react';
import { IconPencil, IconTrash } from '../../../components/icons/Icons';
import { ContextMenu } from '../../../components/ui/ContextMenu';
import type { DriveRecord } from '../../drive/types';

export interface DriveContextMenuState {
  drive: DriveRecord;
  x: number;
  y: number;
}

interface PublishDriveContextMenuProps {
  state: DriveContextMenuState | null;
  onClose: () => void;
  onRemark: (drive: DriveRecord) => void;
  onRename: (drive: DriveRecord) => void;
  onDelete: (drive: DriveRecord) => void;
}

export function PublishDriveContextMenu({ state, onClose, onRemark, onRename, onDelete }: PublishDriveContextMenuProps) {
  const items = state
    ? [
        {
          key: 'remark',
          label: '编辑备注',
          icon: <IconPencil className="size-3.5" />,
          onSelect: () => onRemark(state.drive),
        },
        {
          key: 'rename',
          label: '重命名',
          icon: <IconPencil className="size-3.5" />,
          onSelect: () => onRename(state.drive),
        },
        {
          key: 'delete',
          label: '删除',
          icon: <IconTrash className="size-3.5" />,
          danger: true,
          onSelect: () => onDelete(state.drive),
        },
      ]
    : [];

  return (
    <ContextMenu
      open={state !== null}
      x={state?.x ?? 0}
      y={state?.y ?? 0}
      items={items}
      onClose={onClose}
    />
  );
}
