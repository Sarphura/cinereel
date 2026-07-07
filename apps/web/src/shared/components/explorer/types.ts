import type React from 'react';
import type { ColumnDef, ColumnOrderState, ColumnSizingState } from '@tanstack/react-table';

export type ExplorerNodeKind = 'file' | 'directory' | string;

export type ExplorerNodeBase = {
  id: string;
  parentId?: string | null;
  label: string;
  kind: ExplorerNodeKind;
  children?: ExplorerNodeBase[];
};

export type ExplorerNodeAdapter<TNode> = {
  getId: (node: TNode) => string;
  getLabel: (node: TNode) => string;
  getKind: (node: TNode) => ExplorerNodeKind;
  getChildren: (node: TNode) => TNode[] | undefined;
  isBranch: (node: TNode) => boolean;
};

export type TreePathAdapter<TNode> = {
  getPath: (node: TNode) => string;
  getParentPath: (node: TNode) => string;
  buildChildPath: (parent: TNode, childName: string) => string;
  buildRenamedPath: (node: TNode, nextName: string) => string;
  isDescendant: (ancestor: TNode, candidate: TNode) => boolean;
};

export type ExplorerColumn<TNode> = ColumnDef<TNode, any>;

export type ExplorerColumnLayout = {
  columnOrder: ColumnOrderState;
  columnSizing: ColumnSizingState;
};

export type ExplorerColumnLayoutConfig = {
  storageKey: string;
  defaultOrder: string[];
  defaultSizing: ColumnSizingState;
  minSizing?: ColumnSizingState;
};

export type ExplorerAction<TNode> = {
  id: string;
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
  run: (node: TNode) => void;
};

export type ExplorerNodeIconRenderer<TNode> = (node: TNode) => React.ReactNode;
export type ExplorerNodeBadgeRenderer<TNode> = (node: TNode) => React.ReactNode;

export type ExplorerRenderers<TNode> = {
  renderNodeIcon?: ExplorerNodeIconRenderer<TNode>;
  renderNodeBadge?: ExplorerNodeBadgeRenderer<TNode>;
  renderEmpty?: (label: string) => React.ReactNode;
  renderLoading?: (label: string) => React.ReactNode;
  renderError?: (message: string) => React.ReactNode;
};

/**
 * Path-based file resource node. This is a preset contract for file-manager
 * adapters, not the generic Explorer core contract.
 */
export type ExplorerNode = {
  path: string;
  name: string;
  type: 'file' | 'directory';
  size: number;
  updatedAt: number;
  children?: ExplorerNode[];
};
