import React from 'react';
import type { ResourceTreeNode } from '../types';

/** Drive 节点的扫描失败徽标。传给 `ExplorerSection`/`ExplorerTree` 的 `renderNodeBadge` 插槽。 */
export function renderDriveScanStatusBadge(node: ResourceTreeNode): React.ReactNode {
  if (node.scanStatus !== 'failed') {
    return null;
  }

  return (
    <span
      className="ml-2 shrink-0 rounded-full border border-[#7f1d1d] bg-[#450a0a]/70 px-2 py-0.5 text-[10px] font-semibold text-[#fca5a5]"
      title={node.scanError ?? '扫描失败'}
    >
      扫描失败
    </span>
  );
}
