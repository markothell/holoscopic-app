'use client';

import { useEffect, useState } from 'react';

export default function ServiceWorkerRegistration() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    // Register the service worker
    const registerSW = async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js');
        setRegistration(reg);
        console.log('[SW] Service worker registered');

        // Check for updates periodically
        const checkForUpdates = () => {
          reg.update().catch(err => {
            console.log('[SW] Update check failed:', err);
          });
        };

        // Check for updates every 60 seconds
        const updateInterval = setInterval(checkForUpdates, 60000);

        // Listen for new service worker waiting
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // New version available
                setUpdateAvailable(true);
              }
            });
          }
        });

        return () => {
          clearInterval(updateInterval);
        };
      } catch (error) {
        console.error('[SW] Registration failed:', error);
      }
    };

    registerSW();
  }, []);

  const handleUpdate = () => {
    if (registration && registration.waiting) {
      // Tell the service worker to skip waiting
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });

      // Reload the page when the new service worker takes over
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
      });
    }
  };

  if (!updateAvailable) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 bg-slate-800 text-white p-4 rounded-lg shadow-lg z-50 border border-slate-600">
      <p className="text-sm mb-3">
        A new version of Holoscopic is available!
      </p>
      <div className="flex gap-2">
        <button
          onClick={handleUpdate}
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
        >
          Update Now
        </button>
        <button
          onClick={() => setUpdateAvailable(false)}
          className="px-4 py-2 text-slate-400 hover:text-white text-sm transition-colors"
        >
          Later
        </button>
      </div>
    </div>
  );
}
