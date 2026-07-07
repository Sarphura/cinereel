import React from 'react';
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import type { Table } from '@tanstack/react-table';
import { HeaderCell } from './HeaderCell';
import type { ExplorerNode } from './types';

export function ExplorerHeader<TNode extends ExplorerNode>({ table }: { table: Table<TNode> }) {
  const visibleLeafColumns = table.getVisibleLeafColumns();

  return (
    <thead className="sticky top-0 z-10 bg-[#1c1c1f]">
      {table.getHeaderGroups().map((headerGroup) => (
        <SortableContext
          key={headerGroup.id}
          items={visibleLeafColumns.map((column) => column.id)}
          strategy={horizontalListSortingStrategy}
        >
          <tr>
            {headerGroup.headers.map((header) => {
              if (header.isPlaceholder) {
                return <th key={header.id} />;
              }

              return <HeaderCell key={header.id} header={header} />;
            })}
          </tr>
        </SortableContext>
      ))}
    </thead>
  );
}
