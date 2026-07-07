import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ExplorerPreviewPanel } from './ExplorerPreviewPanel';

describe('ExplorerPreviewPanel', () => {
  it('delegates preview body rendering to the provided renderer', () => {
    render(
      <ExplorerPreviewPanel
        preview={{
          resourcePath: '/custom.resource',
          name: 'custom.resource',
          kind: 'image',
          url: '/preview',
        }}
        previewLabel="Custom Preview"
        previewLoadState="ready"
        previewError={null}
        onClose={() => undefined}
        onPreviewError={() => undefined}
        renderContent={({ preview }) => (
          <div>Rendered by adapter: {preview.name}</div>
        )}
      />,
    );

    expect(screen.getByText('Rendered by adapter: custom.resource')).toBeTruthy();
  });

  it('delegates preview body rendering through a renderer registry', () => {
    render(
      <ExplorerPreviewPanel
        preview={{
          resourcePath: '/document.pdf',
          name: 'document.pdf',
          kind: 'pdf',
          url: '/preview',
        }}
        previewLabel="Registry Preview"
        previewLoadState="ready"
        previewError={null}
        onClose={() => undefined}
        onPreviewError={() => undefined}
        renderers={{
          pdf: ({ preview }) => <div>PDF renderer: {preview.name}</div>,
        }}
      />,
    );

    expect(screen.getByText('PDF renderer: document.pdf')).toBeTruthy();
  });
});
