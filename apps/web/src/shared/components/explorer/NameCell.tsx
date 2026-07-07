import React from 'react';
import type { Row } from '@tanstack/react-table';
import {
  IconChevronDown,
  IconDownload,
  IconFile,
  IconFolder,
} from '../../../components/icons/Icons';
import type { ExplorerNode, ExplorerNodeIconRenderer } from './types';

export function NameCell<TNode extends ExplorerNode>({
  row,
  onToggle,
  isDownloadable,
  onDownload,
  onPreview,
  isPreviewable,
  onContextMenu,
  renderNodeIcon,
  renderNodeBadge,
}: {
  row: Row<TNode>;
  onToggle: (path: string) => void;
  isDownloadable?: (node: TNode) => boolean;
  onDownload?: (node: TNode) => void;
  onPreview?: (node: TNode) => void;
  isPreviewable?: boolean;
  onContextMenu?: (event: React.MouseEvent<HTMLElement>, node: TNode) => void;
  renderNodeIcon?: ExplorerNodeIconRenderer<TNode>;
  renderNodeBadge?: (node: TNode) => React.ReactNode;
}) {
  const node = row.original;
  const canDownload = Boolean(onDownload) && (isDownloadable ? isDownloadable(node) : true);
  const nodeIcon = renderNodeIcon?.(node);

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
        {nodeIcon ? (
          <span className="mr-2.5 flex size-4 shrink-0 items-center justify-center">{nodeIcon}</span>
        ) : node.type === 'directory' ? (
          <IconFolder className="mr-2.5 size-4 shrink-0 text-[#f5c46b]" />
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
        {renderNodeBadge?.(node)}
      </div>
      {canDownload ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onDownload?.(node);
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
