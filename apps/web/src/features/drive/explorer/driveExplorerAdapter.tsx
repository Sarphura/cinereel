import React from 'react';
import { createColumnHelper, type CellContext, type ColumnDef } from '@tanstack/react-table';
import { IconVideo } from '../../../components/icons/Icons';
import {
  FILE_COLUMN_MIN_SIZING,
  FILE_COLUMN_SIZING,
  buildNameColumn,
  buildSizeColumn,
  buildTypeColumn,
  buildUpdatedAtColumn,
  type FileExplorerColumnOptions,
} from '../../../shared/components/explorer/columns';
import { buildChildPath, buildRenamedPath, getParentPath } from '../../../shared/components/explorer/path-utils';
import type { ExplorerColumnLayoutConfig, ExplorerNodeAdapter, TreePathAdapter } from '../../../shared/components/explorer/types';
import type { ResourceTreeNode } from '../types';

export const DRIVE_EXPLORER_COLUMN_ORDER = ['name', 'localDirPath', 'updatedAt', 'size', 'type'];

export const DRIVE_EXPLORER_COLUMN_SIZING = {
  ...FILE_COLUMN_SIZING,
  localDirPath: 280,
};

export const DRIVE_EXPLORER_COLUMN_MIN_SIZING = {
  ...FILE_COLUMN_MIN_SIZING,
  localDirPath: 120,
};

export const driveNodeAdapter: ExplorerNodeAdapter<ResourceTreeNode> = {
  getId: (node) => node.path,
  getLabel: (node) => node.name,
  getKind: (node) => node.type,
  getChildren: (node) => node.children,
  isBranch: (node) => node.type === 'directory',
};

export const driveTreePathAdapter: TreePathAdapter<ResourceTreeNode> = {
  getPath: (node) => node.path,
  getParentPath: (node) => getParentPath(node.path),
  buildChildPath,
  buildRenamedPath: (node, nextName) => buildRenamedPath(node.path, nextName),
  isDescendant: (ancestor, candidate) => candidate.path.startsWith(`${ancestor.path.replace(/\/+$/, '')}/`),
};

export function createDriveExplorerColumnLayout(storageKey: string): ExplorerColumnLayoutConfig {
  return {
    storageKey,
    defaultOrder: DRIVE_EXPLORER_COLUMN_ORDER,
    defaultSizing: DRIVE_EXPLORER_COLUMN_SIZING,
    minSizing: DRIVE_EXPLORER_COLUMN_MIN_SIZING,
  };
}

export function buildDriveExplorerColumns(
  options: Omit<FileExplorerColumnOptions<ResourceTreeNode>, 'renderNodeIcon'>,
): ColumnDef<ResourceTreeNode, any>[] {
  return [
    buildNameColumn({
      ...options,
      renderNodeIcon: renderDriveNodeIcon,
    }),
    buildLocalDirPathColumn(),
    buildUpdatedAtColumn<ResourceTreeNode>(),
    buildSizeColumn<ResourceTreeNode>(),
    buildTypeColumn<ResourceTreeNode>(),
  ];
}

export function renderDriveNodeIcon(node: ResourceTreeNode) {
  return node.type === 'file' && isVideoResourceName(node.name)
    ? <IconVideo className="size-4 text-[#f59e0b]/80" />
    : null;
}

function buildLocalDirPathColumn(): ColumnDef<ResourceTreeNode, string | null> {
  const columnHelper = createColumnHelper<ResourceTreeNode>();

  return columnHelper.accessor((row) => row.localDirPath ?? null, {
    id: 'localDirPath',
    header: '文件所在目录',
    size: DRIVE_EXPLORER_COLUMN_SIZING.localDirPath,
    minSize: DRIVE_EXPLORER_COLUMN_MIN_SIZING.localDirPath,
    sortingFn: (left, right) => (left.original.localDirPath ?? '').localeCompare((right.original.localDirPath ?? ''), 'zh-CN'),
    cell: (context: CellContext<ResourceTreeNode, string | null>) => (
      <span className="block truncate text-[#8b8b97]">
        {context.getValue() || '--'}
      </span>
    ),
  });
}

function isVideoResourceName(name: string) {
  return /\.(mkv|mp4|avi|mov|flv|wmv)$/i.test(name);
}
