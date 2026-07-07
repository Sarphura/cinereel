import { useState } from 'react';
import type { ExplorerNode } from '../types';

/** 管理多选状态：选中路径集合、Shift/Ctrl 范围选择锚点。 */
export function useExplorerSelection<TNode extends ExplorerNode>(onSelectNode?: (node: TNode) => void) {
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [anchorPath, setAnchorPath] = useState<string | null>(null);

  const applySelection = (paths: Set<string>, anchor: string | null, primaryNode: TNode | null) => {
    setSelectedPaths(paths);
    setAnchorPath(anchor);
    if (primaryNode) {
      onSelectNode?.(primaryNode);
    }
  };

  const clearSelection = () => {
    setSelectedPaths(new Set());
    setAnchorPath(null);
  };

  /** 处理行点击：支持 Cmd/Ctrl 追加选中、Shift 范围选中。visiblePaths 由调用方基于当前表格可见行提供。 */
  const handleRowSelect = (
    event: React.MouseEvent<HTMLElement>,
    node: TNode,
    visiblePaths: string[],
  ) => {
    if (event.shiftKey && anchorPath) {
      const anchorIndex = visiblePaths.indexOf(anchorPath);
      const targetIndex = visiblePaths.indexOf(node.path);
      if (anchorIndex !== -1 && targetIndex !== -1) {
        const [start, end] = anchorIndex < targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex];
        applySelection(new Set(visiblePaths.slice(start, end + 1)), anchorPath, node);
        return;
      }
    }

    if (event.metaKey || event.ctrlKey) {
      const next = new Set(selectedPaths);
      if (next.has(node.path)) {
        next.delete(node.path);
      } else {
        next.add(node.path);
      }
      applySelection(next, node.path, node);
      return;
    }

    applySelection(new Set([node.path]), node.path, node);
  };

  return {
    selectedPaths,
    setSelectedPaths,
    anchorPath,
    setAnchorPath,
    applySelection,
    clearSelection,
    handleRowSelect,
  };
}
