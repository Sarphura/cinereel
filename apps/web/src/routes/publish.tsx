import { createFileRoute } from '@tanstack/react-router';
import { loadPublishedExplorerData } from '../features/publish/api/api';
import { PublishRoutePending, PublishRouteView } from '../features/publish/routes/PublishRoute';

export const Route = createFileRoute('/publish')({
  pendingMs: 0,
  pendingComponent: PublishRoutePending,
  validateSearch: (search: Record<string, unknown>) => ({
    driveKey: typeof search.driveKey === 'string' && search.driveKey ? search.driveKey : undefined,
  }),
  loaderDeps: ({ search }) => ({
    driveKey: search.driveKey,
  }),
  loader: async ({ deps }) => {
    try {
      return await loadPublishedExplorerData(deps.driveKey);
    } catch (error) {
      return { drives: [], selectedDriveKey: null, resourceTree: null, error: error instanceof Error ? error.message : '数据加载失败。' };
    }
  },
  component: PublishRouteView,
});
