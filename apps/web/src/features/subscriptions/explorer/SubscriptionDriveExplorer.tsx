import React, { useMemo } from 'react';
import { ExplorerSection } from '../../../shared/components/explorer/ExplorerSection';
import type { ExplorerPreviewState, PreviewLoadState } from '../../../shared/components/explorer/ExplorerPreviewPanel';
import { renderDriveScanStatusBadge } from '../../drive/components/DriveScanStatusBadge';
import { buildDriveExplorerColumns, createDriveExplorerColumnLayout } from '../../drive/explorer/driveExplorerAdapter';
import type { ResourceTreeNode } from '../../drive/types';

const SUBSCRIPTION_DRIVE_EXPLORER_LAYOUT_KEY = 'cinereel.explorer.subscriptionDrive.columns';

export function SubscriptionDriveExplorer({
  resourceTree,
  refreshing,
  onRefresh,
  isDownloadable,
  onDownloadNode,
  onContextMenuNode,
  onPreviewNode,
  isPreviewableNode,
  preview,
  previewLabel,
  previewLoadState,
  previewError,
  onClosePreview,
  onPreviewError,
  requiresStreamingPlayer,
}: {
  resourceTree: ResourceTreeNode | null;
  refreshing: boolean;
  onRefresh: () => void | Promise<void>;
  isDownloadable?: (node: ResourceTreeNode) => boolean;
  onDownloadNode?: (node: ResourceTreeNode) => void;
  onContextMenuNode?: (event: React.MouseEvent<HTMLElement>, node: ResourceTreeNode) => void;
  onPreviewNode: (node: ResourceTreeNode) => void;
  isPreviewableNode: (node: ResourceTreeNode) => boolean;
  preview: ExplorerPreviewState | null;
  previewLabel: string;
  previewLoadState: PreviewLoadState;
  previewError: string | null;
  onClosePreview: () => void;
  onPreviewError: (message: string) => void;
  requiresStreamingPlayer?: (name: string) => boolean;
}) {
  const columnLayout = useMemo(
    () => createDriveExplorerColumnLayout(SUBSCRIPTION_DRIVE_EXPLORER_LAYOUT_KEY),
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
      onContextMenuNode={onContextMenuNode}
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
    />
  );
}
