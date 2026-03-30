/**
 * Entry point — the file referenced by vite-plugin-monkey's `entry` config.
 *
 * Bootstraps the App as early as possible. If the document is still
 * loading (which it usually is, since we run at `document-start`),
 * we defer until DOMContentLoaded.
 */

import { App } from '@app/main';

function init(): void {
  new App().bootstrap();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
