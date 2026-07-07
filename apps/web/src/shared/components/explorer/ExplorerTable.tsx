import React from 'react';
import type { Table } from '@tanstack/react-table';
import { ExplorerHeader } from './ExplorerHeader';
import { ExplorerRows } from './ExplorerRows';
import type { ClipboardState } from './hooks/useExplorerClipboard';
import type { ExplorerNode } from './types';

export function ExplorerTable<TNode extends ExplorerNode>({
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
    <table className="table-fixed border-separate border-spacing-0" style={{ width: table.getTotalSize() }}>
      <colgroup>
        {visibleLeafColumns.map((column) => (
          <col
            key={column.id}
            style={{
              width: column.getSize(),
              minWidth: column.getSize(),
              maxWidth: column.getSize(),
            }}
          />
        ))}
      </colgroup>
      <ExplorerHeader table={table} />
      <ExplorerRows
        table={table}
        selectedPaths={selectedPaths}
        selectedNodePath={selectedNodePath}
        clipboard={clipboard}
        dropTargetPath={dropTargetPath}
        emptyLabel={emptyLabel}
        onRowSelect={onRowSelect}
        onToggleRow={onToggleRow}
        onPreviewNode={onPreviewNode}
        isPreviewableNode={isPreviewableNode}
        onNodeContextMenu={onNodeContextMenu}
      />
    </table>
  );
}
