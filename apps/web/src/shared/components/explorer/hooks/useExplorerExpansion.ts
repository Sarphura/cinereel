import { useEffect, useRef, useState } from 'react';
import type { ExpandedState } from '@tanstack/react-table';
import { collectDirectoryPaths, collectDirectoryPathSet } from '../path-utils';
import type { ExplorerNode } from '../types';

type ExpandedPathState = Record<string, boolean>;

function pathSetToExpandedState(paths: Iterable<string>): ExpandedPathState {
  return Array.from(paths).reduce<ExpandedPathState>((accumulator, path) => {
    accumulator[path] = true;
    return accumulator;
  }, {});
}

function buildInitialExpandedState<TNode extends ExplorerNode>(root?: TNode | null): ExpandedPathState {
  return pathSetToExpandedState(
    (root?.children ?? [])
      .filter((child) => child.type === 'directory')
      .map((child) => child.path),
  );
}

/** 找出因为新增子节点而应当自动展开的目录路径（例如刷新后新扫描到的文件）。 */
function collectDirectoriesWithNewChildren<TNode extends ExplorerNode>(
  previousNodes: TNode[],
  nextNodes: TNode[],
  ancestorPaths: string[] = [],
): Set<string> {
  const expandedPaths = new Set<string>();
  const previousDirectoryMap = new Map(
    previousNodes
      .filter((node) => node.type === 'directory')
      .map((node) => [node.path, node] as const),
  );

  nextNodes.forEach((node) => {
    if (node.type !== 'directory') {
      return;
    }

    const previousNode = previousDirectoryMap.get(node.path);
    const previousChildKeys = new Set((previousNode?.children ?? []).map((child) => `${child.type}:${child.path}`));
    const hasNewDirectChild = (node.children ?? []).some((child) => !previousChildKeys.has(`${child.type}:${child.path}`));

    if (hasNewDirectChild) {
      ancestorPaths.forEach((path) => expandedPaths.add(path));
      expandedPaths.add(node.path);
    }

    const nestedExpandedPaths = collectDirectoriesWithNewChildren(
      (previousNode?.children ?? []) as TNode[],
      (node.children ?? []) as TNode[],
      [...ancestorPaths, node.path],
    );

    nestedExpandedPaths.forEach((path) => expandedPaths.add(path));
  });

  return expandedPaths;
}

/**
 * 管理树的展开/折叠状态：
 * - 首次加载时默认展开根节点下一层目录
 * - 根数据变化时，保留仍然有效的展开路径，并自动展开新增了子节点的目录
 * - 响应外部“展开全部/折叠全部”触发器（通过递增的数字触发）
 */
export function useExplorerExpansion<TNode extends ExplorerNode>({
  root,
  expandAllTrigger,
  collapseAllTrigger,
}: {
  root?: TNode | null;
  expandAllTrigger?: number;
  collapseAllTrigger?: number;
}) {
  const [expanded, setExpanded] = useState<ExpandedPathState>(() => buildInitialExpandedState(root));

  const hasInitializedExpandedRef = useRef(false);
  const previousRootRef = useRef<TNode | null | undefined>(root);
  const lastExpandAllTriggerRef = useRef(expandAllTrigger);
  const lastCollapseAllTriggerRef = useRef(collapseAllTrigger);

  useEffect(() => {
    if (!root) {
      previousRootRef.current = root;
      return;
    }

    const previousRoot = previousRootRef.current;
    setExpanded((current) => {
      if (!hasInitializedExpandedRef.current) {
        hasInitializedExpandedRef.current = true;
        return buildInitialExpandedState(root);
      }

      const validDirectoryPaths = collectDirectoryPathSet(root);
      const currentExpandedPaths = new Set(
        Object.entries(current)
          .filter(([, isOpen]) => Boolean(isOpen))
          .map(([path]) => path),
      );
      const nextExpandedPaths = new Set([...currentExpandedPaths].filter((path) => validDirectoryPaths.has(path)));

      if (previousRoot) {
        const directoriesWithNewChildren = collectDirectoriesWithNewChildren(
          (previousRoot.children ?? []) as TNode[],
          (root.children ?? []) as TNode[],
        );

        directoriesWithNewChildren.forEach((path) => {
          if (validDirectoryPaths.has(path)) {
            nextExpandedPaths.add(path);
          }
        });
      }

      return pathSetToExpandedState(nextExpandedPaths);
    });

    previousRootRef.current = root;
  }, [root]);

  useEffect(() => {
    if (!root) {
      return;
    }

    if (expandAllTrigger === undefined || Object.is(lastExpandAllTriggerRef.current, expandAllTrigger)) {
      return;
    }

    lastExpandAllTriggerRef.current = expandAllTrigger;
    setExpanded(pathSetToExpandedState(collectDirectoryPaths((root.children ?? []) as TNode[])));
  }, [expandAllTrigger, root]);

  useEffect(() => {
    if (collapseAllTrigger === undefined || Object.is(lastCollapseAllTriggerRef.current, collapseAllTrigger)) {
      return;
    }

    lastCollapseAllTriggerRef.current = collapseAllTrigger;
    setExpanded({});
  }, [collapseAllTrigger]);

  const toggleRow = (path: string) => {
    setExpanded((current) => {
      const next = { ...current };

      if (next[path]) {
        delete next[path];
      } else {
        next[path] = true;
      }

      return next;
    });
  };

  const onExpandedChange = (updater: ExpandedState | ((old: ExpandedState) => ExpandedState)) => {
    setExpanded((current) => {
      const next = typeof updater === 'function' ? updater(current as ExpandedState) : updater;
      return next === true ? pathSetToExpandedState(collectDirectoryPaths((root?.children ?? []) as TNode[])) : next;
    });
  };

  return {
    expanded,
    toggleRow,
    onExpandedChange,
  };
}
