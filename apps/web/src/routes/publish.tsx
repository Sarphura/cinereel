import { createFileRoute } from '@tanstack/react-router';
import { loadPublishedExplorerData } from '../features/publish/api/api';
import { PublishRoutePending, PublishRouteView } from '../features/publish/routes/PublishRoute';

export const Route = createFileRoute('/publish')({
  pendingMs: 0,
  pendingComponent: PublishRoutePending,
  validateSearch: (search: Record<string, unknown>) => {
    const driveId = typeof search.driveId === 'string' && search.driveId
      ? search.driveId
      : typeof search.driveKey === 'string' && search.driveKey
        ? search.driveKey
        : undefined;

    return { driveId };
  },
  loaderDeps: ({ search }) => ({
    driveId: search.driveId,
  }),
  loader: async ({ deps }) => {
    try {
      return await loadPublishedExplorerData(deps.driveId);
    } catch (error) {
      return { drives: [], selectedDriveKey: null, resourceTree: null, error: error instanceof Error ? error.message : '数据加载失败。' };
    }
  },
  component: PublishRouteView,
});
