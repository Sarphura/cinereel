import React from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { ExplorerNode } from './types';

export const DRAG_PREFIX = 'node:';
export const DROP_PREFIX = 'dir:';

export function isNodeDragId(id: string | number): boolean {
  return String(id).startsWith(DRAG_PREFIX);
}

export function RootDropZone<TNode extends ExplorerNode>({
  root,
  children,
  width,
  onContextMenu,
  onClick,
}: {
  root: TNode;
  children: React.ReactNode;
  width: number;
  onContextMenu?: (event: React.MouseEvent<HTMLElement>) => void;
  onClick?: (event: React.MouseEvent<HTMLElement>) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: DROP_PREFIX + root.path,
    data: { node: root },
  });

  return (
    <div
      ref={setNodeRef}
      onContextMenu={onContextMenu}
      onClick={onClick}
      className={`min-h-full ${isOver ? 'bg-[#f59e0b]/4 ring-1 ring-inset ring-[#f59e0b]/40' : ''}`}
      style={{ width, minWidth: '100%' }}
    >
      {children}
    </div>
  );
}

export function DraggableRow<TNode extends ExplorerNode>({
  children,
  node,
  className,
  onClick,
  onContextMenu,
  isDropTarget,
}: {
  children: React.ReactNode;
  node: TNode;
  className: string;
  onClick?: (event: React.MouseEvent<HTMLElement>) => void;
  onContextMenu?: (event: React.MouseEvent<HTMLElement>) => void;
  isDropTarget?: boolean;
}) {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: DRAG_PREFIX + node.path,
    data: { node },
  });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: DROP_PREFIX + node.path,
    disabled: node.type !== 'directory',
    data: { node },
  });

  const isHighlighted = node.type === 'directory' && (isOver || isDropTarget);

  return (
    <tr
      ref={(el) => {
        setDragRef(el);
        if (node.type === 'directory') setDropRef(el);
      }}
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={`${className} ${isDragging ? 'opacity-40' : ''} ${
        isHighlighted ? 'bg-[#f59e0b]/6 ring-1 ring-[#f59e0b]/50' : ''
      }`}
      {...attributes}
      {...listeners}
    >
      {children}
    </tr>
  );
}
