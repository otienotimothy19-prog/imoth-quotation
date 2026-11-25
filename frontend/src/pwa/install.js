// Captures the browser's "install this app" prompt as early as possible
// (it can fire before any React component has mounted) and registers the
// service worker that makes the platform installable.
let deferredPrompt = null;
const listeners = new Set();

function notify() {
  listeners.forEach((fn) => fn());
}

export function isStandalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

export function isIos() {
  const ua = window.navigator.userAgent || "";
  return /iphone|ipad|ipod/i.test(ua) || (ua.includes("Macintosh") && "ontouchend" in document);
}

export function canPromptInstall() {
  return deferredPrompt !== null;
}

export async function promptInstall() {
  if (!deferredPrompt) return false;
  const event = deferredPrompt;
  deferredPrompt = null;
  notify();
  await event.prompt();
  const choice = await event.userChoice;
  return choice?.outcome === "accepted";
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setupPwa() {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    notify();
  });

  // Only in production builds: a caching service worker fights Vite's dev server.
  if (import.meta.env.PROD && "serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* Installability is a progressive enhancement; the site works without it. */
      });
    });
  }
}
