import type { ExplorerNode } from './types';

/** 从 explorer 内路径计算父目录路径 */
export function getParentPath(nodePath: string): string {
  const lastSlash = nodePath.lastIndexOf('/');
  if (lastSlash <= 0) return '/';
  return nodePath.slice(0, lastSlash);
}

/** 计算重命名后的新路径 */
export function buildRenamedPath(oldPath: string, newName: string): string {
  const parent = getParentPath(oldPath);
  return parent === '/' ? `/${newName}` : `${parent}/${newName}`;
}

/** 计算某节点移动/复制到目标目录下后的新路径 */
export function buildChildPath(targetDir: ExplorerNode, name: string): string {
  return targetDir.path === '/' ? `/${name}` : `${targetDir.path}/${name}`;
}

/** 在树中按路径查找节点（根节点本身也可命中） */
export function findNodeByPath<TNode extends ExplorerNode>(
  root: TNode | null | undefined,
  path: string,
): TNode | null {
  if (!root) return null;
  if (root.path === path) return root;

  for (const child of root.children ?? []) {
    const match = findNodeByPath(child as TNode, path);
    if (match) return match;
  }

  return null;
}

/** 递归收集所有目录节点的路径 */
export function collectDirectoryPaths<TNode extends ExplorerNode>(nodes: TNode[]): string[] {
  return nodes.flatMap((node) => {
    if (node.type !== 'directory') {
      return [];
    }

    return [node.path, ...collectDirectoryPaths((node.children ?? []) as TNode[])];
  });
}

export function collectDirectoryPathSet<TNode extends ExplorerNode>(root?: TNode | null) {
  return new Set(collectDirectoryPaths((root?.children ?? []) as TNode[]));
}
