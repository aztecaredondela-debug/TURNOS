// Service worker mínimo: permite instalar la app. No guarda nada en caché,
// así siempre se carga la última versión y los datos en tiempo real de Firebase.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
