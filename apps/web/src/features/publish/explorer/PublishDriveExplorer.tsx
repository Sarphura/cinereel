import React, { useMemo } from 'react';
import { ExplorerSection } from '../../../shared/components/explorer/ExplorerSection';
import type { ExplorerPreviewState, PreviewLoadState } from '../../../shared/components/explorer/ExplorerPreviewPanel';
import { renderDriveScanStatusBadge } from '../../drive/components/DriveScanStatusBadge';
import type { ResourceTreeNode } from '../../drive/types';
import { buildDriveExplorerColumns, createDriveExplorerColumnLayout } from '../../drive/explorer/driveExplorerAdapter';

const PUBLISH_DRIVE_EXPLORER_LAYOUT_KEY = 'cinereel.explorer.publishDrive.columns';

export function PublishDriveExplorer({
  resourceTree,
  refreshing,
  onRefresh,
  isDownloadable,
  onDownloadNode,
  onPreviewNode,
  isPreviewableNode,
  preview,
  previewLabel,
  previewLoadState,
  previewError,
  onClosePreview,
  onPreviewError,
  requiresStreamingPlayer,
  onSelectNode,
  selectedNodePath,
  onRenameNode,
  onMoveNode,
  onCopyNode,
  onCreateFolder,
  onDeleteNode,
}: {
  resourceTree: ResourceTreeNode | null;
  refreshing: boolean;
  onRefresh: () => void | Promise<void>;
  isDownloadable?: (node: ResourceTreeNode) => boolean;
  onDownloadNode?: (node: ResourceTreeNode) => void;
  onPreviewNode: (node: ResourceTreeNode) => void;
  isPreviewableNode: (node: ResourceTreeNode) => boolean;
  preview: ExplorerPreviewState | null;
  previewLabel: string;
  previewLoadState: PreviewLoadState;
  previewError: string | null;
  onClosePreview: () => void;
  onPreviewError: (message: string) => void;
  requiresStreamingPlayer?: (name: string) => boolean;
  onSelectNode?: (node: ResourceTreeNode) => void;
  selectedNodePath?: string | null;
  onRenameNode?: (node: ResourceTreeNode, newPath: string) => Promise<void>;
  onMoveNode?: (node: ResourceTreeNode, targetDir: ResourceTreeNode) => Promise<void>;
  onCopyNode?: (node: ResourceTreeNode, targetDir: ResourceTreeNode) => Promise<void>;
  onCreateFolder?: (parentDir: ResourceTreeNode, name: string) => Promise<void>;
  onDeleteNode?: (node: ResourceTreeNode) => Promise<void>;
}) {
  const columnLayout = useMemo(
    () => createDriveExplorerColumnLayout(PUBLISH_DRIVE_EXPLORER_LAYOUT_KEY),
    [],
  );

  const buildColumns = useMemo(() => buildDriveExplorerColumns, []);

  return (
    <ExplorerSection
      resourceTree={resourceTree}
      buildColumns={buildColumns}
      columnLayout={columnLayout}
      refreshing={refreshing}
      onRefresh={onRefresh}
      showTreeControls
      isDownloadable={isDownloadable}
      onDownloadNode={onDownloadNode}
      onPreviewNode={onPreviewNode}
      isPreviewableNode={isPreviewableNode}
      renderNodeBadge={renderDriveScanStatusBadge}
      preview={preview}
      previewLabel={previewLabel}
      previewLoadState={previewLoadState}
      previewError={previewError}
      onClosePreview={onClosePreview}
      onPreviewError={onPreviewError}
      requiresStreamingPlayer={requiresStreamingPlayer}
      onSelectNode={onSelectNode}
      selectedNodePath={selectedNodePath}
      onRenameNode={onRenameNode}
      onMoveNode={onMoveNode}
      onCopyNode={onCopyNode}
      onCreateFolder={onCreateFolder}
      onDeleteNode={onDeleteNode}
      getRenameDescription={(node) => `注意：重命名将导致订阅者重新同步"${node.name}"的内容`}
    />
  );
}
