/**
 * Shared utility helpers — lightweight functions used across features.
 */

import { CONFIG } from '@shared/config';

/** Decode a JWT payload without validation. */
export function parseJwt(token: string): Record<string, unknown> | null {
  try {
    const base64 = token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/');
    const binary = window.atob(base64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Collapse all whitespace runs into single spaces and trim. */
export function normalizeText(str: string | undefined | null): string {
  return str ? str.replace(/\s+/g, ' ').trim() : '';
}

/** Promise-based delay. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** DJB2-like hash → base-36 string prefixed with `q_`. */
export function generateHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  return 'q_' + Math.abs(hash).toString(36);
}

/**
 * Build auth headers from the JWT stored in localStorage.
 *
 * The Bearer token is the sole auth mechanism. XSRF is not required —
 * Tampermonkey runs in an isolated sandbox where document.cookie is
 * empty, and the API accepts Bearer-only requests.
 */
export async function getAuthHeaders(): Promise<HeadersInit | null> {
  try {
    const raw = localStorage.getItem(CONFIG.storage.auth) ?? '{}';
    const authToken = (JSON.parse(raw) as { token?: string }).token;
    if (!authToken) return null;

    return {
      'content-type': 'application/json',
      authorization: `Bearer ${authToken}`,
    };
  } catch {
    return null;
  }
}
