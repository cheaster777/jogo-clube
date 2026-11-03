/// <reference types="vite-plugin-pwa/client" />
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import { registerSW } from 'virtual:pwa-register';
import { AuthProvider } from './contexts/AuthContext';
import App from './App.tsx';
import { initPwa, isNativeApp, markUpdateReady } from './lib/pwa';
import './index.css';

initPwa();

// The Capacitor app ships its files inside the APK and needs no service worker.
if (!isNativeApp()) {
  const updateServiceWorker = registerSW({
    onNeedRefresh: () => markUpdateReady(() => void updateServiceWorker(true)),
  });
}

createRoot(document.getElementById('root')!).render(
  <MotionConfig reducedMotion="user">
    <AuthProvider>
      <App />
    </AuthProvider>
  </MotionConfig>
);
