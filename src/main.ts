/**
 * Entry point — the file referenced by vite-plugin-monkey's `entry` config.
 *
 * Phase 1: Attach the network Sniffer immediately (at `document-start`)
 *          so no SPA API calls are missed.
 * Phase 2: Once the DOM is ready, inject styles and initialize plugins.
 */

import { App } from '@app/main';

const app = new App();

// Phase 1 — must run before SPA scripts execute
app.attachSniffer();

// Phase 2 — deferred until DOM is available
function initPlugins(): void {
  app.bootstrap().catch((e) => console.error('[Uni-X] Bootstrap failed:', e));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPlugins, { once: true });
} else {
  initPlugins();
}
