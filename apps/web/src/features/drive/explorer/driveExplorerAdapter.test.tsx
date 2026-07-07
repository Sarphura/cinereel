import { describe, expect, it } from 'vitest';
import { buildDriveExplorerColumns, createDriveExplorerColumnLayout, driveNodeAdapter, driveTreePathAdapter, renderDriveNodeIcon } from './driveExplorerAdapter';
import type { ResourceTreeNode } from '../types';

describe('driveExplorerAdapter', () => {
  it('defines Drive-specific columns outside shared explorer', () => {
    const columns = buildDriveExplorerColumns({
      onToggle: () => undefined,
    });

    expect(columns.map((column) => column.id)).toEqual(['name', 'localDirPath', 'updatedAt', 'size', 'type']);
  });

  it('creates caller-owned column layout config', () => {
    const layout = createDriveExplorerColumnLayout('test.drive.columns');

    expect(layout.storageKey).toBe('test.drive.columns');
    expect(layout.defaultOrder).toEqual(['name', 'localDirPath', 'updatedAt', 'size', 'type']);
    expect(layout.defaultSizing.localDirPath).toBe(280);
  });

  it('keeps media icon strategy in the Drive adapter', () => {
    const videoNode = makeNode({ name: 'movie.mkv' });
    const textNode = makeNode({ name: 'notes.txt' });

    expect(renderDriveNodeIcon(videoNode)).not.toBeNull();
    expect(renderDriveNodeIcon(textNode)).toBeNull();
  });

  it('maps Drive nodes to generic explorer contracts', () => {
    const root = makeNode({ path: '/', name: '/', type: 'directory' });
    const child = makeNode({ path: '/movies/clip.mp4', name: 'clip.mp4' });

    expect(driveNodeAdapter.getId(child)).toBe('/movies/clip.mp4');
    expect(driveNodeAdapter.getLabel(child)).toBe('clip.mp4');
    expect(driveNodeAdapter.isBranch(root)).toBe(true);
    expect(driveTreePathAdapter.getParentPath(child)).toBe('/movies');
    expect(driveTreePathAdapter.buildRenamedPath(child, 'trailer.mp4')).toBe('/movies/trailer.mp4');
    expect(driveTreePathAdapter.isDescendant(makeNode({ path: '/movies', type: 'directory' }), child)).toBe(true);
  });
});

function makeNode(overrides: Partial<ResourceTreeNode>): ResourceTreeNode {
  return {
    path: '/resource',
    name: 'resource.txt',
    type: 'file',
    size: 1,
    updatedAt: 1,
    ...overrides,
  };
}
