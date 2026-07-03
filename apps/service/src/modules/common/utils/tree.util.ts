export type TreeNode = {
  path: string
  name: string
  type: 'file' | 'directory'
  size: number
  updatedAt: number
  children?: TreeNode[]
}

export interface DriveEntry {
  key: string
  value?: {
    blob?: { byteLength?: number }
    metadata?: { mtime?: number }
  }
}

/**
 * 将平铺的 Hyperdrive 文件列表转换为树形结构
 * @param entries Hyperdrive list() 返回的文件列表
 * @returns 包含所有文件的 TreeNode 树根节点
 */
export function buildTreeFromEntries(entries: DriveEntry[]): TreeNode {
  const nodeMap = new Map<string, TreeNode>()
  const root: TreeNode = {
    path: '/',
    name: '/',
    type: 'directory',
    size: 0,
    updatedAt: 0,
    children: [],
  }
  nodeMap.set('/', root)

  for (const entry of entries) {
    const parts = entry.key.split('/').filter(Boolean)
    let current = root

    for (let i = 0; i < parts.length; i++) {
      const segPath = '/' + parts.slice(0, i + 1).join('/')
      let node = nodeMap.get(segPath)

      if (!node) {
        const isLast = i === parts.length - 1
        node = {
          path: segPath,
          name: parts[i],
          type: isLast ? 'file' : 'directory',
          size: isLast ? (entry.value?.blob?.byteLength ?? 0) : 0,
          updatedAt: isLast ? (entry.value?.metadata?.mtime ?? 0) : 0,
          children: isLast ? undefined : [],
        }
        nodeMap.set(segPath, node)
        current.children = current.children ?? []
        current.children.push(node)
      }

      if (node.type === 'directory') {
        current = node
      }
    }
  }

  return root
}
