import React from 'react';
import { DragOverlay } from '@dnd-kit/core';
import { IconFile, IconFolder, IconMove } from '../../../components/icons/Icons';
import type { ExplorerNode } from './types';

export function ExplorerDragOverlay<TNode extends ExplorerNode>({
  draggingNode,
  draggingCount,
}: {
  draggingNode: TNode | null;
  draggingCount: number;
}) {
  return (
    <DragOverlay dropAnimation={null}>
      {draggingNode ? (
        <div className="flex items-center gap-2 rounded-lg border border-[#f59e0b]/30 bg-[#1c1c1f]/95 px-3 py-1.5 text-[12px] text-[#e4e4e7] shadow-xl backdrop-blur-sm">
          {draggingNode.type === 'directory'
            ? <IconFolder className="size-3.5 shrink-0 text-[#f5c46b]" />
            : <IconFile className="size-3.5 shrink-0 text-[#8b8b97]" />
          }
          <span className="max-w-[200px] truncate">
            {draggingCount > 1 ? `${draggingCount} 个项目` : draggingNode.name}
          </span>
          <IconMove className="size-3 shrink-0 text-[#52525c]" />
        </div>
      ) : null}
    </DragOverlay>
  );
}
