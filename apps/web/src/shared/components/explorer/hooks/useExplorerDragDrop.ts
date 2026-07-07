import { useState } from 'react';
import {
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { getParentPath } from '../path-utils';
import type { ExplorerNode } from '../types';

/** 管理行（节点）拖拽移动：拖拽状态、传感器、拖拽结束时的批量移动执行。 */
export function useExplorerDragDrop<TNode extends ExplorerNode>({
  root,
  selectedPaths,
  findNode,
  onMoveNode,
  setActionError,
}: {
  root?: TNode | null;
  selectedPaths: Set<string>;
  findNode: (path: string) => TNode | null;
  onMoveNode?: (node: TNode, targetDir: TNode) => Promise<void>;
  setActionError: (message: string | null) => void;
}) {
  const [draggingNode, setDraggingNode] = useState<TNode | null>(null);
  const [draggingCount, setDraggingCount] = useState(1);
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null);

  const dragSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const resetDragState = () => {
    setDraggingNode(null);
    setDropTargetPath(null);
    setDraggingCount(1);
  };

  const handleRowDragStart = (event: DragStartEvent) => {
    const node = event.active.data.current?.node as TNode | undefined;
    if (!node) return;

    setDraggingNode(node);
    // 拖拽已选中项之一时，视为批量拖拽整个选区；否则仅拖拽该单项。
    setDraggingCount(selectedPaths.has(node.path) && selectedPaths.size > 1 ? selectedPaths.size : 1);
  };

  const handleRowDragOver = (targetNode: TNode | undefined) => {
    setDropTargetPath(targetNode?.type === 'directory' ? targetNode.path : null);
  };

  const handleRowDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    resetDragState();

    if (!over || !onMoveNode || !root) return;

    const draggedNode = active.data.current?.node as TNode | undefined;
    const targetNode = over.data.current?.node as TNode | undefined;

    if (!draggedNode || !targetNode) return;
    if (targetNode.type !== 'directory') return;

    const isBatch = selectedPaths.has(draggedNode.path) && selectedPaths.size > 1;
    const draggedNodes = isBatch
      ? Array.from(selectedPaths).map((path) => findNode(path)).filter((node): node is TNode => node !== null)
      : [draggedNode];

    setActionError(null);
    const failures: string[] = [];

    for (const node of draggedNodes) {
      if (node.path === targetNode.path) continue;
      if (getParentPath(node.path) === targetNode.path) continue;
      // 不允许移动到自身子目录
      if (targetNode.path.startsWith(`${node.path}/`)) continue;

      try {
        await onMoveNode(node, targetNode);
      } catch (err) {
        failures.push(`${node.name}: ${err instanceof Error ? err.message : '移动失败'}`);
      }
    }

    if (failures.length > 0) {
      setActionError(failures.join('；'));
    }
  };

  return {
    dragSensors,
    draggingNode,
    draggingCount,
    dropTargetPath,
    resetDragState,
    handleRowDragStart,
    handleRowDragOver,
    handleRowDragEnd,
  };
}
