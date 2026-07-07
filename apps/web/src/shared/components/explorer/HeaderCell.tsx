import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { flexRender, type Header } from '@tanstack/react-table';
import { IconSortArrow } from '../../../components/icons/Icons';

export function HeaderCell<TNode>({ header }: { header: Header<TNode, unknown> }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: header.column.id,
  });
  const resizeHandler = header.getResizeHandler();

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    width: header.getSize(),
    minWidth: header.getSize(),
    maxWidth: header.getSize(),
    zIndex: isDragging ? 1 : 0,
  };

  return (
    <th
      ref={setNodeRef}
      colSpan={header.colSpan}
      style={style}
      className="relative h-[27px] overflow-hidden border-b border-[#27272a] bg-[#1c1c1f] p-0 text-[11px] font-medium text-[#71717b]"
    >
      <div
        className={`flex h-full items-center justify-start px-2 ${isDragging ? 'opacity-60' : ''}`}
      >
        <button
          type="button"
          onClick={header.column.getToggleSortingHandler()}
          className="min-w-0 flex flex-1 items-center justify-start gap-1 px-1 text-left"
        >
          <span className={header.column.id === 'name' ? 'text-[#f59e0b]' : 'text-[#71717b]'}>
            {flexRender(header.column.columnDef.header, header.getContext())}
          </span>
          {header.column.getIsSorted() ? (
            <IconSortArrow className={`size-[9px] ${header.column.getIsSorted() === 'desc' ? 'rotate-180' : ''} text-[#f59e0b]`} />
          ) : null}
        </button>
        <button
          type="button"
          {...attributes}
          {...listeners}
          onClick={(event) => event.stopPropagation()}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[#52525c] transition-colors hover:bg-white/5 hover:text-white"
          style={{ cursor: 'grab' }}
          aria-label={`拖动列 ${String(header.column.columnDef.header)}`}
          title="拖动调整列顺序"
        >
          <span className="pointer-events-none flex items-center gap-px">
            <span className="h-2.5 w-px rounded bg-current/70" />
            <span className="h-2.5 w-px rounded bg-current/70" />
          </span>
        </button>
      </div>
      <div
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => {
          event.stopPropagation();
          header.column.resetSize();
        }}
        onMouseDown={(event) => {
          event.stopPropagation();
          resizeHandler(event);
        }}
        onTouchStart={(event) => {
          event.stopPropagation();
          resizeHandler(event);
        }}
        className={`absolute right-0 top-0 h-full w-3 cursor-col-resize select-none touch-none ${
          header.column.getIsResizing() ? 'bg-[#f59e0b]/20' : ''
        }`}
      >
        <span className="absolute right-1 top-1/2 h-3.5 w-px -translate-y-1/2 bg-[#3f3f46]" />
      </div>
    </th>
  );
}
