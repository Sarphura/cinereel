import React, { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type CellContext,
  type ColumnDef,
  type ColumnOrderState,
  type ColumnSizingState,
  type Header,
  type SortingState,
} from '@tanstack/react-table';
import { IconChevronDown, IconFile, IconFolder, IconVideo, IconSortArrow } from '../Icons';

export interface ResourceTreeNode {
  path: string;
  name: string;
  type: 'file' | 'directory';
  size: number;
  updatedAt: number;
  children?: ResourceTreeNode[];
}

type ColumnKey = 'name' | 'updatedAt' | 'size' | 'type';

type TreeRow = ResourceTreeNode & {
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
  parentPath: string | null;
};

type StoredLayout = {
  columnOrder: ColumnOrderState;
  columnSizing: ColumnSizingState;
};

type SortDirection = 'asc' | 'desc';

const STORAGE_KEY = 'cinereel.publish.tableLayout';

const DEFAULT_COLUMN_ORDER: ColumnKey[] = ['name', 'updatedAt', 'size', 'type'];

const DEFAULT_COLUMN_SIZING: ColumnSizingState = {
  name: 420,
  updatedAt: 180,
  size: 116,
  type: 96,
};

const MIN_COLUMN_SIZES: Record<ColumnKey, number> = {
  name: 180,
  updatedAt: 148,
  size: 96,
  type: 88,
};

const DATE_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const columnHelper = createColumnHelper<TreeRow>();

function formatDate(value: number) {
  return DATE_FORMATTER.format(value).replace(/\//g, '-');
}

function formatSize(size: number) {
  if (size <= 0) {
    return '--';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let current = size;
  let unitIndex = 0;

  while (current >= 1024 && unitIndex < units.length - 1) {
    current /= 1024;
    unitIndex += 1;
  }

  const digits = current >= 100 || unitIndex === 0 ? 0 : 1;
  return `${current.toFixed(digits)} ${units[unitIndex]}`;
}

function loadStoredLayout(): StoredLayout {
  if (typeof window === 'undefined') {
    return {
      columnOrder: DEFAULT_COLUMN_ORDER,
      columnSizing: DEFAULT_COLUMN_SIZING,
    };
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<StoredLayout>;
    const storedOrder = Array.isArray(parsed.columnOrder)
      ? parsed.columnOrder.filter((key): key is ColumnKey => DEFAULT_COLUMN_ORDER.includes(key as ColumnKey))
      : [];
    const missingKeys = DEFAULT_COLUMN_ORDER.filter((key) => !storedOrder.includes(key));
    const columnOrder = [...storedOrder, ...missingKeys];

    const columnSizing = DEFAULT_COLUMN_ORDER.reduce((accumulator, key) => {
      const nextWidth = parsed.columnSizing?.[key];
      accumulator[key] = typeof nextWidth === 'number' && Number.isFinite(nextWidth)
        ? Math.max(MIN_COLUMN_SIZES[key], nextWidth)
        : DEFAULT_COLUMN_SIZING[key];
      return accumulator;
    }, {} as ColumnSizingState);

    return {
      columnOrder,
      columnSizing,
    };
  } catch {
    return {
      columnOrder: DEFAULT_COLUMN_ORDER,
      columnSizing: DEFAULT_COLUMN_SIZING,
    };
  }
}

function buildInitialExpandedPaths(root?: ResourceTreeNode | null) {
  return new Set(
    (root?.children ?? [])
      .filter((child) => child.type === 'directory')
      .map((child) => child.path),
  );
}

function flattenTree(
  nodes: ResourceTreeNode[],
  expandedPaths: Set<string>,
  depth = 0,
  parentPath: string | null = null,
): TreeRow[] {
  return nodes.flatMap((node) => {
    const hasChildren = Boolean(node.children?.length);
    const isExpanded = hasChildren && expandedPaths.has(node.path);
    const row: TreeRow = {
      ...node,
      depth,
      hasChildren,
      isExpanded,
      parentPath,
    };

    if (!hasChildren || !isExpanded) {
      return [row];
    }

    return [row, ...flattenTree(node.children ?? [], expandedPaths, depth + 1, node.path)];
  });
}

function compareTreeNodes(
  left: ResourceTreeNode,
  right: ResourceTreeNode,
  columnKey: ColumnKey,
  direction: SortDirection,
) {
  let result = 0;

  if (columnKey === 'name') {
    result = left.name.localeCompare(right.name, 'zh-CN');
  } else if (columnKey === 'updatedAt') {
    result = left.updatedAt - right.updatedAt;
  } else if (columnKey === 'size') {
    result = left.size - right.size;
  } else {
    result = left.type.localeCompare(right.type, 'zh-CN');
  }

  return direction === 'asc' ? result : result * -1;
}

function sortTreeNodes(
  nodes: ResourceTreeNode[],
  sorting: SortingState,
): ResourceTreeNode[] {
  if (!sorting.length) {
    return nodes;
  }

  const [{ id, desc }] = sorting;
  const columnKey = id as ColumnKey;
  const direction: SortDirection = desc ? 'desc' : 'asc';

  return nodes
    .map((node) => ({
      ...node,
      children: node.children ? sortTreeNodes(node.children, sorting) : undefined,
    }))
    .sort((left, right) => compareTreeNodes(left, right, columnKey, direction));
}

function NameCell({
  row,
  onToggle,
}: {
  row: TreeRow;
  onToggle: (path: string) => void;
}) {
  const isVideo = row.name.match(/\.(mkv|mp4|avi|mov|flv|wmv)$/i);
  return (
    <div className="flex items-center min-w-0" style={{ paddingLeft: `${row.depth * 18}px` }}>
      <button
        type="button"
        onClick={row.hasChildren ? (e) => { e.stopPropagation(); onToggle(row.path); } : undefined}
        className={`mr-1.5 flex size-5 shrink-0 items-center justify-center rounded text-[#52525c] hover:bg-white/5 hover:text-white transition-colors ${!row.hasChildren ? 'invisible' : ''}`}
      >
        <IconChevronDown className={`size-3 transition-transform duration-200 ${row.isExpanded ? 'rotate-0' : '-rotate-90'}`} />
      </button>
      {row.type === 'directory' ? (
        <IconFolder className="mr-2.5 size-4 shrink-0 text-[#f5c46b]" />
      ) : isVideo ? (
        <IconVideo className="mr-2.5 size-4 shrink-0 text-[#f59e0b]/80" />
      ) : (
        <IconFile className="mr-2.5 size-4 shrink-0 text-[#8b8b97]" />
      )}
      <span className="truncate text-[#e4e4e7] font-normal leading-none">{row.name}</span>
    </div>
  );
}

function HeaderCell({ header }: { header: Header<TreeRow, unknown> }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: header.column.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    width: header.getSize(),
    zIndex: isDragging ? 1 : 0,
  };

  return (
    <th
      ref={setNodeRef}
      colSpan={header.colSpan}
      style={style}
      className="relative h-[27px] border-b border-[#27272a] bg-[#1c1c1f] p-0 text-[11px] font-medium text-[#71717b]"
    >
      <div
        {...attributes}
        {...listeners}
        onClick={header.column.getToggleSortingHandler()}
        className={`flex h-full items-center justify-start px-3 ${isDragging ? 'opacity-60' : ''}`}
        style={{ cursor: 'grab' }}
      >
        <div className="min-w-0 flex flex-1 items-center justify-start gap-1 text-left">
          <span className={header.column.id === 'name' ? 'text-[#f59e0b]' : 'text-[#71717b]'}>
            {flexRender(header.column.columnDef.header, header.getContext())}
          </span>
          {header.column.getIsSorted() ? (
            <IconSortArrow className={`size-[9px] ${header.column.getIsSorted() === 'desc' ? 'rotate-180' : ''} text-[#f59e0b]`} />
          ) : null}
        </div>
      </div>
      <div
        onDoubleClick={() => header.column.resetSize()}
        onMouseDown={header.getResizeHandler()}
        onTouchStart={header.getResizeHandler()}
        className={`absolute right-0 top-0 h-full w-3 cursor-col-resize select-none touch-none ${
          header.column.getIsResizing() ? 'bg-[#f59e0b]/20' : ''
        }`}
      >
        <span className="absolute right-1 top-1/2 h-3.5 w-px -translate-y-1/2 bg-[#3f3f46]" />
      </div>
    </th>
  );
}

function buildColumns(
  onToggle: (path: string) => void,
): ColumnDef<TreeRow, any>[] {
  return [
    columnHelper.accessor('name', {
      id: 'name',
      header: '名称',
      size: DEFAULT_COLUMN_SIZING.name,
      minSize: MIN_COLUMN_SIZES.name,
      cell: (context: CellContext<TreeRow, string>) => (
        <NameCell row={context.row.original} onToggle={onToggle} />
      ),
    }),
    columnHelper.accessor('updatedAt', {
      id: 'updatedAt',
      header: '修改日期',
      size: DEFAULT_COLUMN_SIZING.updatedAt,
      minSize: MIN_COLUMN_SIZES.updatedAt,
      cell: (context: CellContext<TreeRow, number>) => (
        <span className="text-[#8b8b97]">{formatDate(context.getValue())}</span>
      ),
    }),
    columnHelper.accessor('size', {
      id: 'size',
      header: '大小',
      size: DEFAULT_COLUMN_SIZING.size,
      minSize: MIN_COLUMN_SIZES.size,
      cell: (context: CellContext<TreeRow, number>) => (
        <span className="text-[#8b8b97]">
          {context.row.original.type === 'directory' ? '--' : formatSize(context.getValue())}
        </span>
      ),
    }),
    columnHelper.accessor('type', {
      id: 'type',
      header: '种类',
      size: DEFAULT_COLUMN_SIZING.type,
      minSize: MIN_COLUMN_SIZES.type,
      cell: (context: CellContext<TreeRow, 'file' | 'directory'>) => (
        <span className="text-[#71717b]">{context.getValue() === 'directory' ? '文件夹' : '文件'}</span>
      ),
    }),
  ];
}

export const ResourceTree: React.FC<{ root?: ResourceTreeNode | null }> = ({ root }) => {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => buildInitialExpandedPaths(root));
  const [layout, setLayout] = useState<StoredLayout>(loadStoredLayout);
  const [sorting, setSorting] = useState<SortingState>([]);

  useEffect(() => {
    setExpandedPaths(buildInitialExpandedPaths(root));
  }, [root]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  }, [layout]);

  const sortedNodes = useMemo(() => sortTreeNodes(root?.children ?? [], sorting), [root, sorting]);

  const rows = useMemo(() => flattenTree(sortedNodes, expandedPaths), [expandedPaths, sortedNodes]);

  const toggleRow = (path: string) => {
    setExpandedPaths((current) => {
      const next = new Set(current);

      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }

      return next;
    });
  };

  const columns = useMemo(() => buildColumns(toggleRow), []);

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.path,
    columnResizeMode: 'onChange',
    state: {
      columnOrder: layout.columnOrder,
      columnSizing: layout.columnSizing,
      sorting,
    },
    onColumnOrderChange: (updater) => {
      setLayout((current) => ({
        ...current,
        columnOrder: typeof updater === 'function' ? updater(current.columnOrder) : updater,
      }));
    },
    onColumnSizingChange: (updater) => {
      setLayout((current) => ({
        ...current,
        columnSizing: typeof updater === 'function' ? updater(current.columnSizing) : updater,
      }));
    },
    onSortingChange: setSorting,
    defaultColumn: {
      minSize: 80,
    },
    enableSorting: true,
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const currentOrder = table.getState().columnOrder;
    const oldIndex = currentOrder.indexOf(active.id as ColumnKey);
    const newIndex = currentOrder.indexOf(over.id as ColumnKey);

    if (oldIndex === -1 || newIndex === -1) {
      return;
    }

    table.setColumnOrder(arrayMove(currentOrder, oldIndex, newIndex));
  };

  const visibleLeafColumns = table.getVisibleLeafColumns();

  if (!root) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[#52525c]">
        还没有可展示的资源
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-[#18181b]">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <table className="min-w-full table-fixed border-separate border-spacing-0">
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
          <tbody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <tr 
                  key={row.id} 
                  onClick={row.original.hasChildren ? () => toggleRow(row.original.path) : undefined}
                  className="group hover:bg-white/[0.03] transition-colors cursor-default"
                >
                  {row.getVisibleCells().map((cell) => {
                    const columnId = cell.column.id as ColumnKey;
                    const alignment = columnId === 'size'
                      ? 'justify-end text-right'
                      : columnId === 'updatedAt' || columnId === 'type'
                        ? 'justify-center text-center'
                        : '';

                    return (
                      <td
                        key={cell.id}
                        style={{ width: cell.column.getSize() }}
                        className="h-[38px] px-0 py-0 text-[12px] border-b border-transparent"
                      >
                        <div className={`flex h-[38px] items-center px-3 ${alignment} text-[#a1a1aa]`}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={visibleLeafColumns.length} className="h-[240px] text-center text-sm text-[#52525c]">
                  还没有可展示的资源
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </DndContext>
    </div>
  );
};
