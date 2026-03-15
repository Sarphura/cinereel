import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  getExpandedRowModel,
  getSortedRowModel,
  useReactTable,
  type CellContext,
  type ColumnDef,
  type ColumnOrderState,
  type ColumnSizingState,
  type ExpandedState,
  type Header,
  type Row,
  type SortingState,
} from '@tanstack/react-table';
import { IconChevronDown, IconDownload, IconEye, IconFile, IconFolder, IconVideo, IconSortArrow } from '../Icons';
import type { ResourceTreeNode } from '../../features/drives/types';

type ColumnKey = 'name' | 'localDirPath' | 'updatedAt' | 'size' | 'type';

type StoredLayout = {
  columnOrder: ColumnOrderState;
  columnSizing: ColumnSizingState;
};

type ExpandedPathState = Record<string, boolean>;

const STORAGE_KEY = 'cinereel.publish.tableLayout';

const DEFAULT_COLUMN_ORDER: ColumnKey[] = ['name', 'localDirPath', 'updatedAt', 'size', 'type'];

const DEFAULT_COLUMN_SIZING: ColumnSizingState = {
  name: 420,
  localDirPath: 280,
  updatedAt: 180,
  size: 116,
  type: 96,
};

const MIN_COLUMN_SIZES: Record<ColumnKey, number> = {
  name: 180,
  localDirPath: 120,
  updatedAt: 96,
  size: 64,
  type: 56,
};

const DATE_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const columnHelper = createColumnHelper<ResourceTreeNode>();

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

function pathSetToExpandedState(paths: Iterable<string>): ExpandedPathState {
  return Array.from(paths).reduce<ExpandedPathState>((accumulator, path) => {
    accumulator[path] = true;
    return accumulator;
  }, {});
}

function buildInitialExpandedState(root?: ResourceTreeNode | null): ExpandedPathState {
  return pathSetToExpandedState(
    (root?.children ?? [])
      .filter((child) => child.type === 'directory')
      .map((child) => child.path),
  );
}

function collectDirectoryPaths(nodes: ResourceTreeNode[]): string[] {
  return nodes.flatMap((node) => {
    if (node.type !== 'directory') {
      return [];
    }

    return [node.path, ...collectDirectoryPaths(node.children ?? [])];
  });
}

function collectDirectoryPathSet(root?: ResourceTreeNode | null) {
  return new Set(collectDirectoryPaths(root?.children ?? []));
}

function collectDirectoriesWithNewChildren(
  previousNodes: ResourceTreeNode[],
  nextNodes: ResourceTreeNode[],
  ancestorPaths: string[] = [],
): Set<string> {
  const expandedPaths = new Set<string>();
  const previousDirectoryMap = new Map(
    previousNodes
      .filter((node) => node.type === 'directory')
      .map((node) => [node.path, node] as const),
  );

  nextNodes.forEach((node) => {
    if (node.type !== 'directory') {
      return;
    }

    const previousNode = previousDirectoryMap.get(node.path);
    const previousChildKeys = new Set((previousNode?.children ?? []).map((child) => `${child.type}:${child.path}`));
    const hasNewDirectChild = (node.children ?? []).some((child) => !previousChildKeys.has(`${child.type}:${child.path}`));

    if (hasNewDirectChild) {
      ancestorPaths.forEach((path) => expandedPaths.add(path));
      expandedPaths.add(node.path);
    }

    const nestedExpandedPaths = collectDirectoriesWithNewChildren(
      previousNode?.children ?? [],
      node.children ?? [],
      [...ancestorPaths, node.path],
    );

    nestedExpandedPaths.forEach((path) => expandedPaths.add(path));
  });

  return expandedPaths;
}

function NameCell({
  row,
  onToggle,
  onDownload,
  onPreview,
  isPreviewable,
  onContextMenu,
}: {
  row: Row<ResourceTreeNode>;
  onToggle: (path: string) => void;
  onDownload?: (node: ResourceTreeNode) => void;
  onPreview?: (node: ResourceTreeNode) => void;
  isPreviewable?: boolean;
  onContextMenu?: (event: React.MouseEvent<HTMLElement>, node: ResourceTreeNode) => void;
}) {
  const node = row.original;
  const isVideo = node.name.match(/\.(mkv|mp4|avi|mov|flv|wmv)$/i);

  return (
    <div className="flex w-full min-w-0 items-center justify-between gap-2" onContextMenu={(event) => onContextMenu?.(event, node)}>
      <div className="flex min-w-0 flex-1 items-center" style={{ paddingLeft: `${row.depth * 18}px` }}>
        <button
          type="button"
          onClick={row.getCanExpand() ? (event) => {
            event.stopPropagation();
            onToggle(node.path);
          } : undefined}
          className={`mr-1.5 flex size-5 shrink-0 items-center justify-center rounded text-[#52525c] transition-colors hover:bg-white/5 hover:text-white ${!row.getCanExpand() ? 'invisible' : ''}`}
        >
          <IconChevronDown className={`size-3 transition-transform duration-200 ${row.getIsExpanded() ? 'rotate-0' : '-rotate-90'}`} />
        </button>
        {node.type === 'directory' ? (
          <IconFolder className="mr-2.5 size-4 shrink-0 text-[#f5c46b]" />
        ) : isVideo ? (
          <IconVideo className="mr-2.5 size-4 shrink-0 text-[#f59e0b]/80" />
        ) : (
          <IconFile className="mr-2.5 size-4 shrink-0 text-[#8b8b97]" />
        )}
        {node.type === 'file' && onPreview && isPreviewable ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onPreview(node);
            }}
            className="min-w-0 flex-1 truncate text-left font-normal leading-none text-[#e4e4e7] transition-colors hover:text-white"
            aria-label={`预览文件 ${node.name}`}
            title={`预览文件 ${node.name}`}
          >
            {node.name}
          </button>
        ) : (
          <span className="min-w-0 flex-1 truncate font-normal leading-none text-[#e4e4e7]" title={node.name}>
            {node.name}
          </span>
        )}
      </div>
      {onDownload && !node.localDirPath ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onDownload(node);
          }}
          className="flex size-5 shrink-0 items-center justify-center rounded text-[#52525c] transition-colors hover:bg-white/5 hover:text-white"
          aria-label={`下载${node.type === 'directory' ? '目录' : '文件'} ${node.name}`}
          title={`下载${node.type === 'directory' ? '目录' : '文件'}`}
        >
          <IconDownload className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

function HeaderCell({ header }: { header: Header<ResourceTreeNode, unknown> }) {
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

function buildColumns(
  onToggle: (path: string) => void,
  onDownload?: (node: ResourceTreeNode) => void,
  onPreview?: (node: ResourceTreeNode) => void,
  isPreviewableNode?: (node: ResourceTreeNode) => boolean,
  onContextMenuNode?: (event: React.MouseEvent<HTMLElement>, node: ResourceTreeNode) => void,
): ColumnDef<ResourceTreeNode, any>[] {
  return [
    columnHelper.accessor('name', {
      id: 'name',
      header: '名称',
      size: DEFAULT_COLUMN_SIZING.name,
      minSize: MIN_COLUMN_SIZES.name,
      sortingFn: (left, right) => left.original.name.localeCompare(right.original.name, 'zh-CN'),
      cell: (context: CellContext<ResourceTreeNode, string>) => (
        <NameCell
          row={context.row}
          onToggle={onToggle}
          onDownload={onDownload}
          onPreview={onPreview}
          isPreviewable={isPreviewableNode?.(context.row.original)}
          onContextMenu={onContextMenuNode}
        />
      ),
    }),
    columnHelper.accessor((row) => row.localDirPath ?? null, {
      id: 'localDirPath',
      header: '文件所在目录',
      size: DEFAULT_COLUMN_SIZING.localDirPath,
      minSize: MIN_COLUMN_SIZES.localDirPath,
      sortingFn: (left, right) => (left.original.localDirPath ?? '').localeCompare((right.original.localDirPath ?? ''), 'zh-CN'),
      cell: (context: CellContext<ResourceTreeNode, string | null>) => (
        <span className="block truncate text-[#8b8b97]">
          {context.getValue() || '--'}
        </span>
      ),
    }),
    columnHelper.accessor('updatedAt', {
      id: 'updatedAt',
      header: '修改日期',
      size: DEFAULT_COLUMN_SIZING.updatedAt,
      minSize: MIN_COLUMN_SIZES.updatedAt,
      cell: (context: CellContext<ResourceTreeNode, number>) => (
        <span className="text-[#8b8b97]">{formatDate(context.getValue())}</span>
      ),
    }),
    columnHelper.accessor('size', {
      id: 'size',
      header: '大小',
      size: DEFAULT_COLUMN_SIZING.size,
      minSize: MIN_COLUMN_SIZES.size,
      cell: (context: CellContext<ResourceTreeNode, number>) => (
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
      sortingFn: (left, right) => left.original.type.localeCompare(right.original.type, 'zh-CN'),
      cell: (context: CellContext<ResourceTreeNode, 'file' | 'directory'>) => (
        <span className="text-[#71717b]">{context.getValue() === 'directory' ? '文件夹' : '文件'}</span>
      ),
    }),
  ];
}

export const ResourceTree: React.FC<{
  root?: ResourceTreeNode | null;
  onDownloadNode?: (node: ResourceTreeNode) => void;
  onPreviewNode?: (node: ResourceTreeNode) => void;
  isPreviewableNode?: (node: ResourceTreeNode) => boolean;
  onContextMenuNode?: (event: React.MouseEvent<HTMLElement>, node: ResourceTreeNode) => void;
  expandAllTrigger?: number;
  collapseAllTrigger?: number;
}> = ({ root, onDownloadNode, onPreviewNode, isPreviewableNode, onContextMenuNode, expandAllTrigger, collapseAllTrigger }) => {
  const [expanded, setExpanded] = useState<ExpandedPathState>(() => buildInitialExpandedState(root));
  const [layout, setLayout] = useState<StoredLayout>(loadStoredLayout);
  const [sorting, setSorting] = useState<SortingState>([]);
  const hasInitializedExpandedRef = useRef(false);
  const previousRootRef = useRef<ResourceTreeNode | null | undefined>(root);
  const lastExpandAllTriggerRef = useRef(expandAllTrigger);
  const lastCollapseAllTriggerRef = useRef(collapseAllTrigger);

  useEffect(() => {
    if (!root) {
      previousRootRef.current = root;
      return;
    }

    const previousRoot = previousRootRef.current;
    setExpanded((current) => {
      if (!hasInitializedExpandedRef.current) {
        hasInitializedExpandedRef.current = true;
        return buildInitialExpandedState(root);
      }

      const validDirectoryPaths = collectDirectoryPathSet(root);
      const currentExpandedPaths = new Set(
        Object.entries(current)
          .filter(([, isOpen]) => Boolean(isOpen))
          .map(([path]) => path),
      );
      const nextExpandedPaths = new Set([...currentExpandedPaths].filter((path) => validDirectoryPaths.has(path)));

      if (previousRoot) {
        const directoriesWithNewChildren = collectDirectoriesWithNewChildren(
          previousRoot.children ?? [],
          root.children ?? [],
        );

        directoriesWithNewChildren.forEach((path) => {
          if (validDirectoryPaths.has(path)) {
            nextExpandedPaths.add(path);
          }
        });
      }

      return pathSetToExpandedState(nextExpandedPaths);
    });

    previousRootRef.current = root;
  }, [root]);

  useEffect(() => {
    if (!root) {
      return;
    }

    if (expandAllTrigger === undefined || Object.is(lastExpandAllTriggerRef.current, expandAllTrigger)) {
      return;
    }

    lastExpandAllTriggerRef.current = expandAllTrigger;
    setExpanded(pathSetToExpandedState(collectDirectoryPaths(root.children ?? [])));
  }, [expandAllTrigger, root]);

  useEffect(() => {
    if (collapseAllTrigger === undefined || Object.is(lastCollapseAllTriggerRef.current, collapseAllTrigger)) {
      return;
    }

    lastCollapseAllTriggerRef.current = collapseAllTrigger;
    setExpanded({});
  }, [collapseAllTrigger]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  }, [layout]);

  const toggleRow = (path: string) => {
    setExpanded((current) => {
      const next = { ...current };

      if (next[path]) {
        delete next[path];
      } else {
        next[path] = true;
      }

      return next;
    });
  };

  const columns = useMemo(
    () => buildColumns(toggleRow, onDownloadNode, onPreviewNode, isPreviewableNode, onContextMenuNode),
    [isPreviewableNode, onContextMenuNode, onDownloadNode, onPreviewNode],
  );

  const table = useReactTable({
    data: root?.children ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getSubRows: (row) => row.children ?? [],
    getRowCanExpand: (row) => Boolean(row.original.children?.length),
    getRowId: (row) => row.path,
    columnResizeMode: 'onChange',
    state: {
      columnOrder: layout.columnOrder,
      columnSizing: layout.columnSizing,
      expanded,
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
    onExpandedChange: (updater) => {
      setExpanded((current) => {
        const next = typeof updater === 'function' ? updater(current as ExpandedState) : updater;
        return next === true ? pathSetToExpandedState(collectDirectoryPaths(root?.children ?? [])) : next;
      });
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
                (() => {
                  const canPreview = row.original.type === 'file' && Boolean(onPreviewNode && isPreviewableNode?.(row.original));
                  const handleRowClick = row.getCanExpand()
                    ? () => toggleRow(row.original.path)
                    : canPreview
                      ? () => onPreviewNode?.(row.original)
                      : undefined;

                  return (
                    <tr
                      key={row.id}
                      onClick={handleRowClick}
                      onContextMenu={(event) => onContextMenuNode?.(event, row.original)}
                      className={`group transition-colors hover:bg-white/[0.03] ${
                        handleRowClick ? 'cursor-pointer' : 'cursor-default'
                      }`}
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
                            style={{
                              width: cell.column.getSize(),
                              minWidth: cell.column.getSize(),
                              maxWidth: cell.column.getSize(),
                            }}
                            className="h-[38px] overflow-hidden border-b border-transparent px-0 py-0 text-[12px]"
                          >
                            <div className={`flex h-[38px] min-w-0 items-center px-3 text-[#a1a1aa] ${alignment}`}>
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })()
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
