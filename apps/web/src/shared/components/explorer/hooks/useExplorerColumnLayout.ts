import { useEffect, useState } from 'react';
import type { ColumnOrderState, ColumnSizingState, OnChangeFn } from '@tanstack/react-table';
import type { ExplorerColumnLayout, ExplorerColumnLayoutConfig } from '../types';

function loadStoredLayout(config: ExplorerColumnLayoutConfig): ExplorerColumnLayout {
  const { storageKey, defaultOrder, defaultSizing, minSizing } = config;
  if (typeof window === 'undefined') {
    return {
      columnOrder: defaultOrder,
      columnSizing: defaultSizing,
    };
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) ?? '{}') as Partial<ExplorerColumnLayout>;
    const storedOrder = Array.isArray(parsed.columnOrder)
      ? parsed.columnOrder.filter((key): key is string => defaultOrder.includes(String(key)))
      : [];
    const missingKeys = defaultOrder.filter((key) => !storedOrder.includes(key));
    const columnOrder = [...storedOrder, ...missingKeys];

    const columnSizing = defaultOrder.reduce((accumulator, key) => {
      const nextWidth = parsed.columnSizing?.[key];
      accumulator[key] = typeof nextWidth === 'number' && Number.isFinite(nextWidth)
        ? Math.max(minSizing?.[key] ?? 0, nextWidth)
        : defaultSizing[key];
      return accumulator;
    }, {} as ColumnSizingState);

    return {
      columnOrder,
      columnSizing,
    };
  } catch {
    return {
      columnOrder: defaultOrder,
      columnSizing: defaultSizing,
    };
  }
}

/** 管理表格列顺序 / 列宽并持久化到调用方指定的 localStorage key。 */
export function useExplorerColumnLayout(config: ExplorerColumnLayoutConfig) {
  const [layout, setLayout] = useState<ExplorerColumnLayout>(() => loadStoredLayout(config));

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(config.storageKey, JSON.stringify(layout));
  }, [config.storageKey, layout]);

  useEffect(() => {
    setLayout((current) => {
      const nextOrder = current.columnOrder.filter((key) => config.defaultOrder.includes(String(key)));
      const missingKeys = config.defaultOrder.filter((key) => !nextOrder.includes(key));
      const columnOrder = [...nextOrder, ...missingKeys];
      const columnSizing = config.defaultOrder.reduce((accumulator, key) => {
        const nextWidth = current.columnSizing[key];
        accumulator[key] = typeof nextWidth === 'number' && Number.isFinite(nextWidth)
          ? Math.max(config.minSizing?.[key] ?? 0, nextWidth)
          : config.defaultSizing[key];
        return accumulator;
      }, {} as ColumnSizingState);
      return { columnOrder, columnSizing };
    });
  }, [config.defaultOrder, config.defaultSizing, config.minSizing]);

  const onColumnOrderChange: OnChangeFn<ColumnOrderState> = (updater) => {
    setLayout((current) => ({
      ...current,
      columnOrder: typeof updater === 'function' ? updater(current.columnOrder) : updater,
    }));
  };

  const onColumnSizingChange: OnChangeFn<ColumnSizingState> = (updater) => {
    setLayout((current) => ({
      ...current,
      columnSizing: typeof updater === 'function' ? updater(current.columnSizing) : updater,
    }));
  };

  return {
    layout,
    setLayout,
    onColumnOrderChange,
    onColumnSizingChange,
  };
}
