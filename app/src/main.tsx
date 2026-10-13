import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ApiRequestError } from '@/lib/api';
import { QUERY_DEFAULTS } from '@/lib/defaults';
import { routeTree } from './routeTree.gen.ts';
import './index.css';
import { HttpStatus } from '@llm-router/shared';

/** The one query cache of the app. A request the router refused is not retried: asking again changes nothing. */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (
          error instanceof ApiRequestError &&
          error.status >= HttpStatus.BadRequest &&
          error.status < HttpStatus.InternalServerError
        ) {
          return false;
        }
        return failureCount < QUERY_DEFAULTS.maxRetries;
      },
    },
  },
});

/** The app's router, over the generated route tree. */
const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Missing #root element');
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
