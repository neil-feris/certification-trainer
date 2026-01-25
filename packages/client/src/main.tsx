import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import * as Sentry from '@sentry/react';
import { queryClient } from './lib/queryClient';
import App from './App';
import { initializeServiceWorker } from './services/swRegistration';
import { startListening as startSyncListening } from './services/syncService';
import './styles/globals.css';

// Initialize Sentry for error tracking, performance monitoring, and logging
Sentry.init({
  dsn: 'https://7e9268ecf4371353a1325efcc214dc4e@o4510750025056256.ingest.de.sentry.io/4510750425153616',
  enableLogs: true,
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.consoleLoggingIntegration({ levels: ['log', 'warn', 'error'] }),
  ],
  tracesSampleRate: 1.0,
  environment: import.meta.env.MODE,
});

// Initialize service worker with background sync support
// This enables offline caching, background sync, and periodic cache refresh
initializeServiceWorker();

// Start listening for online/offline events to auto-trigger sync
startSyncListening();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
