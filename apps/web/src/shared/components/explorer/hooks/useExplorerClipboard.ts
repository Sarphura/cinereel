import { useState } from 'react';
import { buildChildPath, findNodeByPath } from '../path-utils';
import type { ExplorerNode } from '../types';

export type ClipboardState = {
  mode: 'copy' | 'cut';
  paths: string[];
};

/** 管理复制/剪切剪贴板状态，以及粘贴到目标目录的批量执行逻辑。 */
export function useExplorerClipboard<TNode extends ExplorerNode>({
  root,
  onCopyNode,
  onMoveNode,
  setActionError,
}: {
  root?: TNode | null;
  onCopyNode?: (node: TNode, targetDir: TNode) => Promise<void>;
  onMoveNode?: (node: TNode, targetDir: TNode) => Promise<void>;
  setActionError: (message: string | null) => void;
}) {
  const [clipboard, setClipboard] = useState<ClipboardState | null>(null);

  const handlePaste = async (targetDir: TNode) => {
    if (!clipboard || !root) return;

    const nodes = clipboard.paths
      .map((path) => findNodeByPath(root, path))
      .filter((node): node is TNode => node !== null);

    if (nodes.length === 0) {
      setClipboard(null);
      return;
    }

    setActionError(null);
    const failures: string[] = [];

    for (const node of nodes) {
      const destPath = buildChildPath(targetDir, node.name);
      if (destPath === node.path || targetDir.path.startsWith(`${node.path}/`) || targetDir.path === node.path) {
        continue;
      }

      try {
        if (clipboard.mode === 'copy') {
          if (onCopyNode) await onCopyNode(node, targetDir);
        } else if (onMoveNode) {
          await onMoveNode(node, targetDir);
        }
      } catch (err) {
        failures.push(`${node.name}: ${err instanceof Error ? err.message : '操作失败'}`);
      }
    }

    if (failures.length > 0) {
      setActionError(failures.join('；'));
    }

    if (clipboard.mode === 'cut') {
      setClipboard(null);
    }
  };

  return {
    clipboard,
    setClipboard,
    handlePaste,
  };
}
