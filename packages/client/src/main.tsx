import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import * as Sentry from '@sentry/react';
import { queryClient } from './lib/queryClient';
import App from './App';
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

// Register service worker for PWA functionality
// This enables offline caching and faster subsequent loads
if ('serviceWorker' in navigator) {
  registerSW({
    onNeedRefresh() {
      // New content available, app will auto-update
      console.log('New content available, refreshing...');
    },
    onOfflineReady() {
      console.log('App ready to work offline');
    },
    onRegistered(registration) {
      console.log('Service worker registered:', registration);
    },
    onRegisterError(error) {
      console.error('Service worker registration failed:', error);
    },
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
