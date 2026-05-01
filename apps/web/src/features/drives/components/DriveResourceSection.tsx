import React, { useState } from 'react';
import { IconRefresh } from '../../../components/Icons';
import { ResourceTree } from '../../../components/publish/ResourceTree';
import { DrivePreviewPanel, type PreviewLoadState, type PreviewState } from '../preview';
import type { ResourceTreeNode } from '../types';
import { ExplorerTreeHeader } from './DriveExplorerChrome';

export function DriveResourceSection({
  resourceTree,
  refreshing,
  onRefresh,
  onPreviewNode,
  isPreviewableNode,
  onDownloadNode,
  onContextMenuNode,
  showTreeControls = false,
  preview,
  previewLabel,
  previewLoadState,
  previewError,
  onClosePreview,
  onPreviewError,
}: {
  resourceTree: ResourceTreeNode | null;
  refreshing: boolean;
  onRefresh: () => void | Promise<void>;
  onPreviewNode: (node: ResourceTreeNode) => void;
  isPreviewableNode: (node: ResourceTreeNode) => boolean;
  onDownloadNode?: (node: ResourceTreeNode) => void;
  onContextMenuNode?: (event: React.MouseEvent<HTMLElement>, node: ResourceTreeNode) => void;
  showTreeControls?: boolean;
  preview: PreviewState | null;
  previewLabel: string;
  previewLoadState: PreviewLoadState;
  previewError: string | null;
  onClosePreview: () => void;
  onPreviewError: (message: string) => void;
}) {
  const [expandAllTrigger, setExpandAllTrigger] = useState(0);
  const [collapseAllTrigger, setCollapseAllTrigger] = useState(0);

  return (
    <>
      <ExplorerTreeHeader
        actions={(
          <div className="flex items-center gap-2">
            {showTreeControls ? (
              <>
                <button
                  type="button"
                  onClick={() => setExpandAllTrigger((current) => current + 1)}
                  disabled={!resourceTree}
                  className="text-[10px] text-[#52525c] hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  展开
                </button>
                <button
                  type="button"
                  onClick={() => setCollapseAllTrigger((current) => current + 1)}
                  disabled={!resourceTree}
                  className="text-[10px] text-[#52525c] hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  折叠
                </button>
              </>
            ) : null}
            <button
              type="button"
              onClick={() => void onRefresh()}
              disabled={refreshing}
              className="size-[22px] flex items-center justify-center rounded hover:bg-white/5 group"
            >
              <IconRefresh className={`size-3.5 transition-[color,transform] ${refreshing ? 'animate-spin text-white' : 'text-[#52525c] group-hover:text-white'}`} />
            </button>
          </div>
        )}
      />

      <div className="flex-1 min-h-0 flex">
        <div className={preview ? 'flex-1 min-w-0 border-r border-[#27272a]' : 'flex-1 min-w-0'}>
          <ResourceTree
            root={resourceTree}
            expandAllTrigger={showTreeControls ? expandAllTrigger : undefined}
            collapseAllTrigger={showTreeControls ? collapseAllTrigger : undefined}
            onDownloadNode={onDownloadNode}
            onPreviewNode={onPreviewNode}
            isPreviewableNode={isPreviewableNode}
            onContextMenuNode={onContextMenuNode}
          />
        </div>

        {preview ? (
          <DrivePreviewPanel
            preview={preview}
            previewLabel={previewLabel}
            previewLoadState={previewLoadState}
            previewError={previewError}
            onClose={onClosePreview}
            onPreviewError={onPreviewError}
          />
        ) : null}
      </div>
    </>
  );
}
