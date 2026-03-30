/**
 * Cloudflare Workers cloud API client.
 *
 * Abstracts all network calls to the answer-sharing backend so that
 * features never construct URLs or headers themselves.
 */

import { CONFIG } from '@shared/config';
import type { CloudAnswersMap } from '@shared/types/api.types';
import { Logger } from '@shared/utils/logger';

/**
 * Fetch cached answers from the cloud by their hash keys.
 * @param keys Array of `q_xxxx` hash strings.
 * @returns A map of hash → answer strings, or empty on failure.
 */
export async function fetchCloudAnswers(
  keys: string[],
): Promise<CloudAnswersMap> {
  if (keys.length === 0) return {};

  try {
    const res = await fetch(
      `${CONFIG.cloud.apiUrl}/api/get?keys=${encodeURIComponent(keys.join(','))}`,
    );
    if (res.ok) {
      return (await res.json()) as CloudAnswersMap;
    }
    Logger.error(`Cloud fetch failed: ${res.status}`);
  } catch (e) {
    Logger.error('Cloud fetch error', e);
  }

  return {};
}

/**
 * Upload newly discovered answers to the cloud.
 * @param payload Hash → correct-answer-strings map.
 */
export async function saveCloudAnswers(
  payload: CloudAnswersMap,
): Promise<void> {
  if (Object.keys(payload).length === 0) return;

  try {
    const res = await fetch(`${CONFIG.cloud.apiUrl}/api/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      Logger.success('New answers uploaded to cloud');
    } else {
      Logger.error(`Cloud save failed: ${res.status}`);
    }
  } catch (e) {
    Logger.error('Cloud save error', e);
  }
}
