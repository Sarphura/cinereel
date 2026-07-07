import React, { useMemo, useState } from 'react';
import {
  DndContext,
  closestCenter,
  pointerWithin,
  type CollisionDetection,
  type DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import {
  getCoreRowModel,
  getExpandedRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { ContextMenu } from '../../../components/ui/ContextMenu';
import { buildFileExplorerColumns, type FileExplorerColumnOptions } from './columns';
import { buildNodeMenuItems, buildRootMenuItems, type NodeContextMenuState, type RootContextMenuState } from './context-menu-items';
import { RootDropZone, isNodeDragId } from './DraggableRow';
import { ExplorerActionErrorToast } from './ExplorerActionErrorToast';
import { ExplorerDragOverlay } from './ExplorerDragOverlay';
import { ExplorerNodeDialogs } from './ExplorerNodeDialogs';
import { ExplorerTable } from './ExplorerTable';
import { findNodeByPath } from './path-utils';
import { useExplorerClipboard } from './hooks/useExplorerClipboard';
import { useExplorerColumnLayout } from './hooks/useExplorerColumnLayout';
import { useExplorerDragDrop } from './hooks/useExplorerDragDrop';
import { useExplorerExpansion } from './hooks/useExplorerExpansion';
import { useExplorerKeyboardShortcuts } from './hooks/useExplorerKeyboardShortcuts';
import { useExplorerNodeDialogs } from './hooks/useExplorerNodeDialogs';
import { useExplorerSelection } from './hooks/useExplorerSelection';
import type { ExplorerColumnLayoutConfig, ExplorerNode, ExplorerNodeIconRenderer } from './types';

export const ExplorerTree = <TNode extends ExplorerNode>({
  root,
  buildColumns,
  columnLayout,
  isDownloadable,
  onDownloadNode,
  onPreviewNode,
  isPreviewableNode,
  onContextMenuNode,
  onSelectNode,
  selectedNodePath,
  onRenameNode,
  onMoveNode,
  onCopyNode,
  onCreateFolder,
  onDeleteNode,
  getRenameDescription,
  expandAllTrigger,
  collapseAllTrigger,
  renderNodeIcon,
  renderNodeBadge,
  emptyLabel = '还没有可展示的资源',
}: {
  root?: TNode | null;
  buildColumns?: (options: FileExplorerColumnOptions<TNode>) => ColumnDef<TNode, any>[];
  columnLayout: ExplorerColumnLayoutConfig;
  isDownloadable?: (node: TNode) => boolean;
  onDownloadNode?: (node: TNode) => void;
  onPreviewNode?: (node: TNode) => void;
  isPreviewableNode?: (node: TNode) => boolean;
  onContextMenuNode?: (event: React.MouseEvent<HTMLElement>, node: TNode) => void;
  onSelectNode?: (node: TNode) => void;
  selectedNodePath?: string | null;
  onRenameNode?: (node: TNode, newPath: string) => Promise<void>;
  onMoveNode?: (node: TNode, targetDir: TNode) => Promise<void>;
  onCopyNode?: (node: TNode, targetDir: TNode) => Promise<void>;
  onCreateFolder?: (parentDir: TNode, name: string) => Promise<void>;
  onDeleteNode?: (node: TNode) => Promise<void>;
  getRenameDescription?: (node: TNode) => string | undefined;
  expandAllTrigger?: number;
  collapseAllTrigger?: number;
  renderNodeIcon?: ExplorerNodeIconRenderer<TNode>;
  renderNodeBadge?: (node: TNode) => React.ReactNode;
  emptyLabel?: string;
}) => {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [nodeMenu, setNodeMenu] = useState<NodeContextMenuState<TNode> | null>(null);
  const [rootMenu, setRootMenu] = useState<RootContextMenuState | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const { expanded, toggleRow, onExpandedChange } = useExplorerExpansion({ root, expandAllTrigger, collapseAllTrigger });
  const { layout, onColumnOrderChange, onColumnSizingChange } = useExplorerColumnLayout(columnLayout);
  const { selectedPaths, setSelectedPaths, anchorPath, applySelection, clearSelection, handleRowSelect } = useExplorerSelection<TNode>(onSelectNode);
  const { clipboard, setClipboard, handlePaste } = useExplorerClipboard<TNode>({ root, onCopyNode, onMoveNode, setActionError });
  const findNode = (path: string) => findNodeByPath(root, path);
  const {
    dragSensors,
    draggingNode,
    draggingCount,
    dropTargetPath,
    resetDragState,
    handleRowDragStart,
    handleRowDragOver,
    handleRowDragEnd,
  } = useExplorerDragDrop<TNode>({ root, selectedPaths, findNode, onMoveNode, setActionError });
  const dialogs = useExplorerNodeDialogs<TNode>({
    onRenameNode,
    onCreateFolder,
    onDeleteNode,
    clearSelection: () => setSelectedPaths(new Set()),
    setActionError,
  });

  const isDialogOpen = dialogs.renameDialog !== null || dialogs.newFolderDialog !== null || dialogs.deleteConfirm !== null;

  // 打开节点右键菜单（内置）
  const openNodeContextMenu = (event: React.MouseEvent<HTMLElement>, node: TNode) => {
    event.preventDefault();
    event.stopPropagation();
    // 同时触发外部 onContextMenuNode（若有，例如业务方自定义菜单）
    onContextMenuNode?.(event, node);

    const effectivePaths = selectedPaths.has(node.path) && selectedPaths.size > 1
      ? Array.from(selectedPaths)
      : [node.path];

    if (effectivePaths.length === 1) {
      applySelection(new Set(effectivePaths), node.path, node);
    }

    setNodeMenu({ node, paths: effectivePaths, x: event.clientX, y: event.clientY });
  };

  // 打开根/空白区域右键菜单
  const openRootContextMenu = (event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault();
    setRootMenu({ x: event.clientX, y: event.clientY });
  };

  const tableColumns = useMemo(
    () => {
      const columnOptions: FileExplorerColumnOptions<TNode> = {
        onToggle: toggleRow,
        isDownloadable,
        onDownload: onDownloadNode,
        onPreview: onPreviewNode,
        isPreviewableNode,
        onContextMenuNode: openNodeContextMenu,
        renderNodeIcon,
        renderNodeBadge,
      };

      return buildColumns ? buildColumns(columnOptions) : buildFileExplorerColumns<TNode>(columnOptions);
    },
    // openNodeContextMenu 依赖 selectedPaths（用于批量右键菜单），必须随其重新创建，
    // 避免 NameCell 内绑定到过期闭包，导致多选后右键仍按单项处理。
    [buildColumns, isDownloadable, onDownloadNode, onPreviewNode, isPreviewableNode, openNodeContextMenu, renderNodeIcon, renderNodeBadge],
  );

  const table = useReactTable({
    data: (root?.children ?? []) as TNode[],
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getSubRows: (row) => (row.children ?? []) as TNode[],
    getRowCanExpand: (row) => Boolean(row.original.children?.length),
    getRowId: (row) => row.path,
    columnResizeMode: 'onChange',
    state: {
      columnOrder: layout.columnOrder,
      columnSizing: layout.columnSizing,
      expanded,
      sorting,
    },
    onColumnOrderChange,
    onColumnSizingChange,
    onExpandedChange,
    onSortingChange: setSorting,
    defaultColumn: {
      minSize: 80,
    },
    enableSorting: true,
  });

  // 根 drop zone 与目录行的 droppable 区域在几何上互相嵌套：默认的
  // closestCenter 只比较矩形中心距离，会让占满整个表格的根区域"抢走"
  // 原本应该命中某个目录行的拖拽悬停。这里改用指针实际落点（pointerWithin）
  // 判断碰撞，并在命中多个区域时优先选择非根的目录行，从而保证：
  //   - 悬停在目录行上方时，该行会显示高亮，而不是根区域整体高亮；
  //   - 悬停在空白区域（含父级留白）时，才会命中根 drop zone。
  const rootDropId = `dir:${root?.path ?? '/'}`;
  const collisionDetectionStrategy: CollisionDetection = (args) => {
    const pointerCollisions = pointerWithin(args);

    if (pointerCollisions.length > 0) {
      const nonRootCollisions = pointerCollisions.filter((collision) => collision.id !== rootDropId);
      return nonRootCollisions.length > 0 ? nonRootCollisions : pointerCollisions;
    }

    return closestCenter(args);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (isNodeDragId(active.id)) {
      void handleRowDragEnd(event);
      return;
    }

    resetDragState();

    if (!over || active.id === over.id) return;

    const currentOrder = table.getState().columnOrder;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (!currentOrder.includes(activeId) || !currentOrder.includes(overId)) return;

    const oldIndex = currentOrder.indexOf(activeId);
    const newIndex = currentOrder.indexOf(overId);
    if (oldIndex === -1 || newIndex === -1) return;
    table.setColumnOrder(arrayMove(currentOrder, oldIndex, newIndex));
  };

  useExplorerKeyboardShortcuts<TNode>({
    root,
    selectedPaths,
    setSelectedPaths,
    anchorPath,
    clipboard,
    setClipboard,
    isDialogOpen,
    onRenameNode,
    onDeleteNode,
    openRenameDialog: dialogs.openRenameDialog,
    openDeleteConfirm: dialogs.openDeleteConfirm,
    handlePaste,
    getVisiblePaths: () => table.getRowModel().rows.map((r) => r.original.path),
    clearSelection,
  });

  if (!root) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[#52525c]">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="relative h-full overflow-auto bg-[#18181b]">
      <DndContext
        sensors={dragSensors}
        collisionDetection={collisionDetectionStrategy}
        onDragStart={handleRowDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={(event) => {
          if (!isNodeDragId(event.active.id)) {
            return;
          }

          const targetNode = event.over?.data.current?.node as TNode | undefined;
          handleRowDragOver(targetNode);
        }}
        onDragCancel={resetDragState}
      >
        <RootDropZone
          root={root}
          width={table.getTotalSize()}
          onContextMenu={openRootContextMenu}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              clearSelection();
            }
          }}
        >
          <ExplorerTable
            table={table}
            selectedPaths={selectedPaths}
            selectedNodePath={selectedNodePath}
            clipboard={clipboard}
            dropTargetPath={dropTargetPath}
            emptyLabel={emptyLabel}
            onRowSelect={handleRowSelect}
            onToggleRow={toggleRow}
            onPreviewNode={onPreviewNode}
            isPreviewableNode={isPreviewableNode}
            onNodeContextMenu={openNodeContextMenu}
          />
        </RootDropZone>

        <ExplorerDragOverlay draggingNode={draggingNode} draggingCount={draggingCount} />
      </DndContext>

      {/* 节点右键菜单（内置，自治） */}
      <ContextMenu
        open={nodeMenu !== null}
        x={nodeMenu?.x ?? 0}
        y={nodeMenu?.y ?? 0}
        items={nodeMenu ? buildNodeMenuItems<TNode>({
          menu: nodeMenu,
          root,
          clipboard,
          onDownloadNode,
          onRenameNode,
          onCopyNode,
          onMoveNode,
          onCreateFolder,
          onDeleteNode,
          onRename: dialogs.openRenameDialog,
          onCopy: (paths) => setClipboard({ mode: 'copy', paths }),
          onCut: (paths) => setClipboard({ mode: 'cut', paths }),
          onPaste: (targetDir) => void handlePaste(targetDir),
          onNewFolder: dialogs.openNewFolderDialog,
          onDelete: dialogs.openDeleteConfirm,
        }) : []}
        onClose={() => setNodeMenu(null)}
      />

      {/* 根/空白区域右键菜单 */}
      <ContextMenu
        open={rootMenu !== null}
        x={rootMenu?.x ?? 0}
        y={rootMenu?.y ?? 0}
        items={buildRootMenuItems<TNode>({
          root,
          clipboard,
          onCopyNode,
          onMoveNode,
          onCreateFolder,
          onPaste: (targetDir) => void handlePaste(targetDir),
          onNewFolder: dialogs.openNewFolderDialog,
        })}
        onClose={() => setRootMenu(null)}
      />

      <ExplorerNodeDialogs
        renameDialog={dialogs.renameDialog}
        newFolderDialog={dialogs.newFolderDialog}
        deleteConfirm={dialogs.deleteConfirm}
        deleting={dialogs.deleting}
        getRenameDescription={getRenameDescription}
        onRenameDialogChange={dialogs.setRenameDialog}
        onNewFolderDialogChange={dialogs.setNewFolderDialog}
        onDeleteConfirmChange={dialogs.setDeleteConfirm}
        onRenameSubmit={dialogs.handleRenameSubmit}
        onCreateFolderSubmit={dialogs.handleCreateFolderSubmit}
        onConfirmDelete={dialogs.handleConfirmDelete}
      />

      <ExplorerActionErrorToast message={actionError} onClose={() => setActionError(null)} />
    </div>
  );
};
