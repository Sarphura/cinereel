import React from 'react';
import { HeroUIProvider } from '@heroui/react';
import { ToastProvider } from '@heroui/toast';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { queryClient } from './lib/queryClient';
import { routeTree } from './routeTree.gen';

const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <HeroUIProvider>
        <RouterProvider router={router} />
        <ToastProvider placement="bottom-right" toastOffset={24} />
        {import.meta.env.DEV && import.meta.env.MODE !== 'test'
          ? <TanStackRouterDevtools router={router} position="bottom-right" />
          : null}
      </HeroUIProvider>
    </QueryClientProvider>
  );
}

export default App;
