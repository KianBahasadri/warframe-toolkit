import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import App from './App';
import { ToastProvider } from './components/Toasts';
import { AppClerkProvider } from './lib/clerk';
import { adoptLegacyLocation } from './lib/routes';
import './styles.css';

const routesInstalled = '__grakataLegacyRoutes';
if (!(routesInstalled in window)) {
  Object.defineProperty(window, routesInstalled, { value: true });
  window.addEventListener('hashchange', () => { if (adoptLegacyLocation()) window.dispatchEvent(new PopStateEvent('popstate')); });
}
adoptLegacyLocation();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppClerkProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </AppClerkProvider>
  </StrictMode>,
);
