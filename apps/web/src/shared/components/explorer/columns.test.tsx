import { describe, expect, it } from 'vitest';
import {
  buildExplorerColumns,
  createExplorerColumnLayout,
  createFileExplorerColumnDefinitions,
  formatDate,
  type ExplorerColumnMeta,
} from './columns';
import type { ExplorerNode } from './types';

describe('explorer columns', () => {
  it('derives layout from column definitions', () => {
    const definitions = createFileExplorerColumnDefinitions<ExplorerNode>();
    const layout = createExplorerColumnLayout('test.columns', definitions);

    expect(layout.defaultOrder).toEqual([
      'name',
      'createdAt',
      'updatedAt',
      'size',
      'type',
    ]);
    expect(layout.defaultSizing.createdAt).toBe(180);
    expect(layout.minSizing?.createdAt).toBe(96);

    const columns = buildExplorerColumns(definitions, {
      onToggle: () => undefined,
    });
    expect(columns.find((column) => column.id === 'name')?.meta).toMatchObject({
      headerAccent: true,
    } satisfies ExplorerColumnMeta);
    expect(columns.find((column) => column.id === 'createdAt')?.meta).toMatchObject({
      align: 'center',
    } satisfies ExplorerColumnMeta);
  });

  it('does not render missing dates as the Unix epoch', () => {
    expect(formatDate(0)).toBe('--');
    expect(formatDate(Number.NaN)).toBe('--');
  });
});
