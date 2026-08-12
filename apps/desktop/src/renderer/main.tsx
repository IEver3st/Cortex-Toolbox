import { installBrowserDevShim } from './browser-dev-shim';

installBrowserDevShim();

import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { LazyMotion, domAnimation } from 'motion/react';
import { App } from './App';
import { CortexToaster } from './components/CortexToaster';
import './styles.css';
import './styles-theme-studio.css';

function recordRendererError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? (error.stack ?? null) : null;
  void window.cortex.reports.recordClientError({ message, stack });
}

window.addEventListener('error', (event) => recordRendererError(event.error ?? event.message));
window.addEventListener('unhandledrejection', (event) => recordRendererError(event.reason));

const client = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 1_000 } } });
const root = document.getElementById('root');
if (!root) throw new Error('Cortex renderer root was not found.');
createRoot(root).render(
  <React.StrictMode>
    <LazyMotion features={domAnimation} strict>
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <App />
        </MemoryRouter>
        <CortexToaster />
      </QueryClientProvider>
    </LazyMotion>
  </React.StrictMode>,
);
