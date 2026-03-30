/**
 * GM storage wrapper — persists data via the userscript engine.
 *
 * `GM_setValue` / `GM_getValue` survive origin changes and site-data
 * wipes, making them ideal for long-lived caches (e.g. quiz answers).
 *
 * Features that need ephemeral storage (e.g. video tokens cleared on 401)
 * use the raw `localStorage` API directly.
 */

import { GM_getValue, GM_setValue } from '$';

export const GMStorage = {
  get<T>(key: string, fallback: T): T {
    return GM_getValue<T>(key, fallback);
  },

  set<T>(key: string, value: T): void {
    GM_setValue(key, value);
  },
} as const;
