import { createFileRoute } from '@tanstack/react-router';
import { loadDriveExplorerData } from '../features/drives/api';
import { SubscribedDrivesRouteView } from '../features/drives/routes/SubscribedDrivesRouteView';

export const Route = createFileRoute('/subscribed-drives')({
  validateSearch: (search: Record<string, unknown>) => ({
    driveKey: typeof search.driveKey === 'string' && search.driveKey ? search.driveKey : undefined,
  }),
  loaderDeps: ({ search }) => ({
    driveKey: search.driveKey,
  }),
  loader: ({ deps }) => loadDriveExplorerData('subscribed', deps.driveKey),
  component: SubscribedDrivesRouteView,
});
