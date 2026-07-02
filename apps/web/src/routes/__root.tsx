import React from 'react';
import { Outlet, createRootRoute, useRouter } from '@tanstack/react-router';
import { MainLayout } from '../components/MainLayout';
import { RouteErrorState, RoutePendingState } from '../shared/components/drive-explorer/DriveExplorerChrome';

function RootLayout() {
  return (
    <MainLayout>
      <Outlet />
    </MainLayout>
  );
}

function NotFoundPage() {
  return <div className="p-8 text-zinc-500">Page not found.</div>;
}

function RootErrorBoundary(props: { error: Error }) {
  const router = useRouter();

  return (
    <RouteErrorState
      title="页面加载失败"
      message={props.error.message || '发生未知错误。'}
      onRetry={() => {
        void router.invalidate();
      }}
    />
  );
}

export const Route = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFoundPage,
  pendingComponent: () => <RoutePendingState label="页面加载中..." />,
  errorComponent: RootErrorBoundary,
});
