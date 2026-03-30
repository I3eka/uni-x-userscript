/**
 * Video Marker Plugin
 *
 * Automatically marks video lessons as "watched" by:
 * 1. Listening for lesson data via the EventBus
 * 2. Checking if the lesson is already watched
 * 3. Generating or reusing a video token
 * 4. Sending the "watched" request to the API
 *
 * Fallback: intercepts localStorage writes from the video player
 * to capture manually-generated tokens.
 */

import type { IPlugin, IPluginContext } from '@core/plugin';
import type { LessonData } from '@shared/types/api.types';
import { CONFIG } from '@shared/config';
import { parseJwt, getAuthHeaders, sleep } from '@shared/utils';
import { showToast } from '@shared/ui/toast';
import { markHeaderSuccess } from '@shared/ui/styles';
import { Logger } from '@shared/utils/logger';
import { TokenGenerator } from './token-generator';

export class VideoMarkerPlugin implements IPlugin {
  readonly name = 'VideoMarker';

  /** Lesson IDs already processed in this page lifecycle — prevents duplicate work. */
  private readonly processedIds = new Set<string>();

  init(context: IPluginContext): void {
    this.interceptStorage();

    // Reactive path: handle future lesson loads intercepted by Sniffer
    context.events.on('network:lessonDataLoaded', (data) =>
      this.processLessonData(data),
    );

    // Proactive path: if we're already on a lesson page (e.g. script was
    // installed/updated while the page was open), fetch lesson data ourselves
    this.proactiveFetch();
  }

  /* ─── Proactive fetch for already-loaded pages ─── */

  private async proactiveFetch(): Promise<void> {
    // Wait for DOM to be ready (we run at document-start)
    if (document.readyState === 'loading') {
      await new Promise<void>((r) =>
        document.addEventListener('DOMContentLoaded', () => r(), { once: true }),
      );
    }

    const lessonId = window.location.href.match(/lessons\/(\d+)/)?.[1];
    if (!lessonId) return; // Not on a lesson page

    const headers = await getAuthHeaders();
    if (!headers) return; // Not authenticated

    try {
      const res = await fetch(`${CONFIG.api.base}/lessons/${lessonId}`, {
        headers,
      });
      if (res.ok) {
        const data = (await res.json()) as LessonData;
        await this.processLessonData(data);
      }
    } catch (e) {
      Logger.error('Proactive lesson fetch failed:', e);
    }
  }

  /* ─── localStorage interception (manual fallback) ─── */

  private interceptStorage(): void {
    const originalSetItem = localStorage.setItem.bind(localStorage);

    localStorage.setItem = function (key: string, value: string) {
      const result = originalSetItem(key, value);

      if (key === CONFIG.storage.videoState) {
        queueMicrotask(() => {
          try {
            const state = JSON.parse(value) as Record<
              string,
              { token?: string; lastWatchedTime?: number }
            >;
            const lessonData = Object.values(state)[0];

            if (
              lessonData?.token &&
              typeof lessonData.lastWatchedTime === 'number'
            ) {
              const payload = parseJwt(lessonData.token) as {
                videoDuration?: number;
              } | null;

              if (
                payload &&
                typeof payload.videoDuration === 'number' &&
                payload.videoDuration > 0 &&
                lessonData.lastWatchedTime >= payload.videoDuration
              ) {
                const currentToken = localStorage.getItem(
                  CONFIG.storage.videoToken,
                );
                if (currentToken !== lessonData.token) {
                  originalSetItem(
                    CONFIG.storage.videoToken,
                    lessonData.token,
                  );
                  showToast('\uD83C\uDFAC Токен обновлен из плеера!', 'info');
                }
              }
            }
          } catch {
            /* intentionally silent */
          }
        });
      }

      return result;
    } as Storage['setItem'];
  }

  /* ─── event handler ─── */

  private async processLessonData(data: LessonData): Promise<void> {
    const currentId = window.location.href.match(/lessons\/(\d+)/)?.[1];
    if (String(data.id) !== String(currentId)) return;

    // Idempotency: skip if we already successfully handled this lesson.
    const key = String(data.id);
    if (this.processedIds.has(key)) return;

    if (data.isWatched) {
      this.processedIds.add(key);
      Logger.success('Урок уже пройден');
      markHeaderSuccess();
      return;
    }

    // Guard: skip all auto-marking logic if user isn't authenticated
    const headers = await getAuthHeaders();
    if (!headers) {
      Logger.log('User not authenticated — skipping video auto-mark');
      return; // Don't mark as processed — user may log in later
    }

    // Past the auth guard — mark as processed to prevent duplicate requests
    this.processedIds.add(key);

    let token = localStorage.getItem(CONFIG.storage.videoToken);

    if (!token) {
      token = await TokenGenerator.generate();
    }

    if (token) {
      const duration =
        data.videoDurationEn ??
        data.videoDurationKz ??
        data.videoDurationRu ??
        100;
      await this.sendWatchedRequest({
        lessonId: data.id,
        duration,
        token,
      });
    } else {
      showToast(
        '\u26A0\uFE0F Посмотрите видео вручную (токен не найден)',
        'warn',
      );
    }
  }

  /* ─── API call ─── */

  private async sendWatchedRequest({
    lessonId,
    duration,
    token,
  }: {
    lessonId: number;
    duration: number;
    token: string;
  }): Promise<void> {
    const headers = await getAuthHeaders();
    if (!headers) return;

    try {
      const res = await fetch(`${CONFIG.api.base}/lessons/${lessonId}/watched`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          token,
          videoDuration: Math.floor(duration),
          videoWatched: Math.floor(duration),
        }),
      });

      if (res.ok) {
        showToast('\uD83C\uDF89 Урок отмечен!');
        markHeaderSuccess();
        await sleep(CONFIG.delays.reloadSuccess);
        window.location.reload();
      } else if (res.status === 400 || res.status === 401) {
        localStorage.removeItem(CONFIG.storage.videoToken);
        showToast('\u267B\uFE0F Токен устарел, обновляю...', 'warn');
        await sleep(CONFIG.delays.reloadError);
        window.location.reload();
      } else {
        Logger.error(`Unexpected response: ${res.status}`);
        showToast(`\u26A0\uFE0F Ошибка сервера (${res.status})`, 'error');
      }
    } catch (e) {
      Logger.error('Ошибка отметки:', e);
    }
  }
}
