import React from 'react';
import { flexRender, type Table } from '@tanstack/react-table';
import { DraggableRow } from './DraggableRow';
import type { ClipboardState } from './hooks/useExplorerClipboard';
import type { ExplorerNode } from './types';

export function ExplorerRows<TNode extends ExplorerNode>({
  table,
  selectedPaths,
  selectedNodePath,
  clipboard,
  dropTargetPath,
  emptyLabel,
  onRowSelect,
  onToggleRow,
  onPreviewNode,
  isPreviewableNode,
  onNodeContextMenu,
}: {
  table: Table<TNode>;
  selectedPaths: Set<string>;
  selectedNodePath?: string | null;
  clipboard: ClipboardState | null;
  dropTargetPath: string | null;
  emptyLabel: string;
  onRowSelect: (event: React.MouseEvent<HTMLElement>, node: TNode, visiblePaths: string[]) => void;
  onToggleRow: (path: string) => void;
  onPreviewNode?: (node: TNode) => void;
  isPreviewableNode?: (node: TNode) => boolean;
  onNodeContextMenu: (event: React.MouseEvent<HTMLElement>, node: TNode) => void;
}) {
  const visibleLeafColumns = table.getVisibleLeafColumns();

  return (
    <tbody>
      {table.getRowModel().rows.length ? (
        table.getRowModel().rows.map((row) => {
          const canPreview = row.original.type === 'file' && Boolean(onPreviewNode && isPreviewableNode?.(row.original));
          const isSelected = selectedPaths.has(row.original.path)
            || (selectedPaths.size === 0 && selectedNodePath != null && row.original.path === selectedNodePath);
          const isCut = clipboard?.mode === 'cut' && clipboard.paths.includes(row.original.path);

          const handleRowClick = (event: React.MouseEvent<HTMLElement>) => {
            onRowSelect(event, row.original, table.getRowModel().rows.map((item) => item.original.path));
            if (event.metaKey || event.ctrlKey || event.shiftKey) {
              return;
            }
            if (row.getCanExpand()) {
              onToggleRow(row.original.path);
            } else if (canPreview) {
              onPreviewNode?.(row.original);
            }
          };

          return (
            <DraggableRow
              key={row.id}
              node={row.original}
              onClick={handleRowClick}
              onContextMenu={(event) => onNodeContextMenu(event, row.original)}
              isDropTarget={dropTargetPath === row.original.path}
              className={`group transition-colors cursor-pointer ${
                isSelected
                  ? 'bg-[#f59e0b]/8 hover:bg-[#f59e0b]/12'
                  : 'hover:bg-white/3'
              } ${isCut ? 'opacity-50' : ''}`}
            >
              {row.getVisibleCells().map((cell) => {
                const columnId = cell.column.id;
                const alignment = columnId === 'size'
                  ? 'justify-end text-right'
                  : columnId === 'updatedAt' || columnId === 'type'
                    ? 'justify-center text-center'
                    : '';

                return (
                  <td
                    key={cell.id}
                    style={{
                      width: cell.column.getSize(),
                      minWidth: cell.column.getSize(),
                      maxWidth: cell.column.getSize(),
                    }}
                    className="h-[38px] overflow-hidden border-b border-transparent px-0 py-0 text-[12px]"
                  >
                    <div className={`flex h-[38px] min-w-0 flex-wrap items-center px-3 text-[#a1a1aa] ${alignment}`}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </div>
                  </td>
                );
              })}
            </DraggableRow>
          );
        })
      ) : (
        <tr>
          <td colSpan={visibleLeafColumns.length} className="h-[240px] text-center text-sm text-[#52525c]">
            {emptyLabel}
          </td>
        </tr>
      )}
    </tbody>
  );
}
