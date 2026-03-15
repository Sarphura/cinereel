import { createFileRoute } from '@tanstack/react-router';
import { loadDriveExplorerData } from '../features/drives/api';
import { SubscriptionsRouteView } from '../features/drives/routes/SubscriptionsRouteView';

export const Route = createFileRoute('/subscriptions')({
  validateSearch: (search: Record<string, unknown>) => ({
    driveKey: typeof search.driveKey === 'string' && search.driveKey ? search.driveKey : undefined,
  }),
  loaderDeps: ({ search }) => ({
    driveKey: search.driveKey,
  }),
  loader: ({ deps }) => loadDriveExplorerData('subscription', deps.driveKey),
  component: SubscriptionsRouteView,
});
