import React from 'react';
import {
  createColumnHelper,
  type CellContext,
  type ColumnDef,
  type ColumnSizingState,
} from '@tanstack/react-table';
import { NameCell } from './NameCell';
import type { ExplorerNode, ExplorerNodeIconRenderer } from './types';

export type FileColumnKey = 'name' | 'updatedAt' | 'size' | 'type';

export const FILE_COLUMN_ORDER: FileColumnKey[] = ['name', 'updatedAt', 'size', 'type'];

export const FILE_COLUMN_SIZING: ColumnSizingState = {
  name: 420,
  updatedAt: 180,
  size: 116,
  type: 96,
};

export const FILE_COLUMN_MIN_SIZING: Record<FileColumnKey, number> = {
  name: 180,
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

export function formatDate(value: number) {
  return DATE_FORMATTER.format(value).replace(/\//g, '-');
}

export function formatSize(size: number) {
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

export type FileExplorerColumnOptions<TNode extends ExplorerNode> = {
  onToggle: (path: string) => void;
  isDownloadable?: (node: TNode) => boolean;
  onDownload?: (node: TNode) => void;
  onPreview?: (node: TNode) => void;
  isPreviewableNode?: (node: TNode) => boolean;
  onContextMenuNode?: (event: React.MouseEvent<HTMLElement>, node: TNode) => void;
  renderNodeIcon?: ExplorerNodeIconRenderer<TNode>;
  renderNodeBadge?: (node: TNode) => React.ReactNode;
};

export function buildFileExplorerColumns<TNode extends ExplorerNode>(
  options: FileExplorerColumnOptions<TNode>,
): ColumnDef<TNode, any>[] {
  return [
    buildNameColumn(options),
    buildUpdatedAtColumn<TNode>(),
    buildSizeColumn<TNode>(),
    buildTypeColumn<TNode>(),
  ];
}

export function buildNameColumn<TNode extends ExplorerNode>({
  onToggle,
  isDownloadable,
  onDownload,
  onPreview,
  isPreviewableNode,
  onContextMenuNode,
  renderNodeIcon,
  renderNodeBadge,
}: FileExplorerColumnOptions<TNode>): ColumnDef<TNode, string> {
  const columnHelper = createColumnHelper<TNode>();

  return columnHelper.accessor((row) => row.name, {
    id: 'name',
    header: '名称',
    size: FILE_COLUMN_SIZING.name,
    minSize: FILE_COLUMN_MIN_SIZING.name,
    sortingFn: (left, right) => left.original.name.localeCompare(right.original.name, 'zh-CN'),
    cell: (context: CellContext<TNode, string>) => (
      <NameCell
        row={context.row}
        onToggle={onToggle}
        isDownloadable={isDownloadable}
        onDownload={onDownload}
        onPreview={onPreview}
        isPreviewable={isPreviewableNode?.(context.row.original)}
        onContextMenu={onContextMenuNode}
        renderNodeIcon={renderNodeIcon}
        renderNodeBadge={renderNodeBadge}
      />
    ),
  });
}

export function buildUpdatedAtColumn<TNode extends ExplorerNode>(): ColumnDef<TNode, number> {
  const columnHelper = createColumnHelper<TNode>();

  return columnHelper.accessor((row) => row.updatedAt, {
    id: 'updatedAt',
    header: '修改日期',
    size: FILE_COLUMN_SIZING.updatedAt,
    minSize: FILE_COLUMN_MIN_SIZING.updatedAt,
    cell: (context: CellContext<TNode, number>) => (
      <span className="text-[#8b8b97]">{formatDate(context.getValue())}</span>
    ),
  });
}

export function buildSizeColumn<TNode extends ExplorerNode>(): ColumnDef<TNode, number> {
  const columnHelper = createColumnHelper<TNode>();

  return columnHelper.accessor((row) => row.size, {
    id: 'size',
    header: '大小',
    size: FILE_COLUMN_SIZING.size,
    minSize: FILE_COLUMN_MIN_SIZING.size,
    cell: (context: CellContext<TNode, number>) => (
      <span className="text-[#8b8b97]">
        {context.row.original.type === 'directory' ? '--' : formatSize(context.getValue())}
      </span>
    ),
  });
}

export function buildTypeColumn<TNode extends ExplorerNode>(): ColumnDef<TNode, 'file' | 'directory'> {
  const columnHelper = createColumnHelper<TNode>();

  return columnHelper.accessor((row) => row.type, {
    id: 'type',
    header: '种类',
    size: FILE_COLUMN_SIZING.type,
    minSize: FILE_COLUMN_MIN_SIZING.type,
    sortingFn: (left, right) => left.original.type.localeCompare(right.original.type, 'zh-CN'),
    cell: (context: CellContext<TNode, 'file' | 'directory'>) => (
      <span className="text-[#71717b]">{context.getValue() === 'directory' ? '文件夹' : '文件'}</span>
    ),
  });
}
