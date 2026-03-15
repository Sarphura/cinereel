import { createFileRoute } from '@tanstack/react-router';
import { loadDriveExplorerData } from '../features/drives/api';
import { PublishRoutePending, PublishRouteView } from '../features/drives/routes/PublishRouteView';

export const Route = createFileRoute('/publish')({
  pendingMs: 0,
  pendingComponent: PublishRoutePending,
  validateSearch: (search: Record<string, unknown>) => ({
    driveKey: typeof search.driveKey === 'string' && search.driveKey ? search.driveKey : undefined,
  }),
  loaderDeps: ({ search }) => ({
    driveKey: search.driveKey,
  }),
  loader: ({ deps }) => loadDriveExplorerData('local', deps.driveKey),
  component: PublishRouteView,
});
