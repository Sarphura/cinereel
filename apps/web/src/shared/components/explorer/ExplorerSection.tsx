import React, { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { IconRefresh } from '../../../components/icons/Icons';
import { ExplorerTreeHeader } from './ExplorerChrome';
import { ExplorerTree } from './ExplorerTree';
import { ExplorerPreviewPanel, type ExplorerPreviewRenderer, type ExplorerPreviewRendererRegistry, type ExplorerPreviewState, type PreviewLoadState } from './ExplorerPreviewPanel';
import type { FileExplorerColumnOptions } from './columns';
import type { ExplorerColumnLayoutConfig, ExplorerNode, ExplorerNodeIconRenderer } from './types';

export function ExplorerSection<TNode extends ExplorerNode, TPreview extends ExplorerPreviewState>({
  resourceTree,
  buildColumns,
  columnLayout,
  refreshing,
  onRefresh,
  onPreviewNode,
  isPreviewableNode,
  isDownloadable,
  onDownloadNode,
  onContextMenuNode,
  onSelectNode,
  selectedNodePath,
  onRenameNode,
  onMoveNode,
  onCopyNode,
  onCreateFolder,
  onDeleteNode,
  getRenameDescription,
  renderNodeIcon,
  renderNodeBadge,
  showTreeControls = false,
  preview,
  previewLabel,
  previewLoadState,
  previewError,
  onClosePreview,
  onPreviewError,
  renderPreviewContent,
  previewRenderers,
  requiresStreamingPlayer,
}: {
  resourceTree: TNode | null;
  buildColumns?: (options: FileExplorerColumnOptions<TNode>) => ColumnDef<TNode, any>[];
  columnLayout: ExplorerColumnLayoutConfig;
  refreshing: boolean;
  onRefresh: () => void | Promise<void>;
  onPreviewNode: (node: TNode) => void;
  isPreviewableNode: (node: TNode) => boolean;
  isDownloadable?: (node: TNode) => boolean;
  onDownloadNode?: (node: TNode) => void;
  onContextMenuNode?: (event: React.MouseEvent<HTMLElement>, node: TNode) => void;
  onSelectNode?: (node: TNode) => void;
  selectedNodePath?: string | null;
  onRenameNode?: (node: TNode, newPath: string) => Promise<void>;
  onMoveNode?: (node: TNode, targetDir: TNode) => Promise<void>;
  onCopyNode?: (node: TNode, targetDir: TNode) => Promise<void>;
  onCreateFolder?: (parentDir: TNode, name: string) => Promise<void>;
  onDeleteNode?: (node: TNode) => Promise<void>;
  getRenameDescription?: (node: TNode) => string | undefined;
  renderNodeIcon?: ExplorerNodeIconRenderer<TNode>;
  renderNodeBadge?: (node: TNode) => React.ReactNode;
  showTreeControls?: boolean;
  preview: TPreview | null;
  previewLabel: string;
  previewLoadState: PreviewLoadState;
  previewError: string | null;
  onClosePreview: () => void;
  onPreviewError: (message: string) => void;
  renderPreviewContent?: ExplorerPreviewRenderer<TPreview>;
  previewRenderers?: ExplorerPreviewRendererRegistry<TPreview>;
  requiresStreamingPlayer?: (name: string) => boolean;
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
          <ExplorerTree
            root={resourceTree}
            buildColumns={buildColumns}
            columnLayout={columnLayout}
            expandAllTrigger={showTreeControls ? expandAllTrigger : undefined}
            collapseAllTrigger={showTreeControls ? collapseAllTrigger : undefined}
            isDownloadable={isDownloadable}
            onDownloadNode={onDownloadNode}
            onPreviewNode={onPreviewNode}
            isPreviewableNode={isPreviewableNode}
            onContextMenuNode={onContextMenuNode}
            onSelectNode={onSelectNode}
            selectedNodePath={selectedNodePath}
            onRenameNode={onRenameNode}
            onMoveNode={onMoveNode}
            onCopyNode={onCopyNode}
            onCreateFolder={onCreateFolder}
            onDeleteNode={onDeleteNode}
            getRenameDescription={getRenameDescription}
            renderNodeIcon={renderNodeIcon}
            renderNodeBadge={renderNodeBadge}
          />
        </div>

        {preview ? (
          <ExplorerPreviewPanel
            preview={preview}
            previewLabel={previewLabel}
            previewLoadState={previewLoadState}
            previewError={previewError}
            onClose={onClosePreview}
            onPreviewError={onPreviewError}
            renderContent={renderPreviewContent as ExplorerPreviewRenderer | undefined}
            renderers={previewRenderers as ExplorerPreviewRendererRegistry | undefined}
            requiresStreamingPlayer={requiresStreamingPlayer}
          />
        ) : null}
      </div>
    </>
  );
}
