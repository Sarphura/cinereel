import { createFileRoute } from '@tanstack/react-router';
import { loadSubscribedExplorerData } from '../features/subscriptions/api';
import { SubscriptionsRoute as SubscribedDrivesRouteView } from '../features/subscriptions/routes/SubscriptionsRoute';

export const Route = createFileRoute('/subscribed-drives')({
  validateSearch: (search: Record<string, unknown>) => ({
    driveKey: typeof search.driveKey === 'string' && search.driveKey ? search.driveKey : undefined,
  }),
  loaderDeps: ({ search }) => ({
    driveKey: search.driveKey,
  }),
  loader: async ({ deps }) => {
    try {
      return await loadSubscribedExplorerData(deps.driveKey);
    } catch (error) {
      return { drives: [], selectedDriveKey: null, resourceTree: null, error: error instanceof Error ? error.message : '数据加载失败。' };
    }
  },
  component: SubscribedDrivesRouteView,
});
