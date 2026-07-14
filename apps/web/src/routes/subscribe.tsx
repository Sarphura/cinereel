import { createFileRoute } from '@tanstack/react-router';
import { loadSubscribeExplorerData } from '../features/subscriptions/api';
import { SubscriptionsRoute } from '../features/subscriptions/routes/SubscriptionsRoute';

export const Route = createFileRoute('/subscribe')({
  validateSearch: (search: Record<string, unknown>) => ({
    driveKey: typeof search.driveKey === 'string' && search.driveKey ? search.driveKey : undefined,
  }),
  loaderDeps: ({ search }) => ({
    driveKey: search.driveKey,
  }),
  loader: async ({ deps }) => {
    try {
      return await loadSubscribeExplorerData(deps.driveKey);
    } catch (error) {
      return { drives: [], selectedDriveKey: null, resourceTree: null, error: error instanceof Error ? error.message : '数据加载失败。' };
    }
  },
  component: SubscriptionsRoute,
});
