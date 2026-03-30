/**
 * Network Sniffer — intercepts XHR and Fetch responses to detect API calls.
 *
 * This is the "sensor layer" of the microkernel. It monkey-patches the
 * browser's networking primitives *before* the SPA loads, captures
 * responses that match known API patterns, and emits typed events
 * through the EventBus.
 *
 * Important: the Sniffer runs at `document-start` so it must patch
 * `XMLHttpRequest.prototype.open` and `window.fetch` before the
 * platform's own code executes.
 */

import { CONFIG } from '@shared/config';
import { Logger } from '@shared/utils/logger';
import type { EventBus } from '@core/events/EventBus';
import type {
  LessonData,
  QuizQuestionsData,
  QuizResultData,
} from '@shared/types/api.types';

export class Sniffer {
  constructor(private readonly eventBus: EventBus) {}

  /** Attach XHR + Fetch interceptors. Call once during bootstrap. */
  attach(): void {
    this.patchXHR();
    this.patchFetch();
    Logger.log('Network sniffer attached');
  }

  /* ─── internal ─── */

  private handleResponse(url: string, text: string): void {
    try {
      // Ignore our own magic-lesson requests to avoid feedback loops.
      if (!url || !text || url.includes('/validates/watched')) return;

      if (CONFIG.api.lessonInfoRegex.test(url)) {
        this.eventBus.emit(
          'network:lessonDataLoaded',
          JSON.parse(text) as LessonData,
        );
      } else if (CONFIG.api.quizQuestionsRegex.test(url)) {
        this.eventBus.emit(
          'network:quizQuestionsLoaded',
          JSON.parse(text) as QuizQuestionsData,
        );
      } else if (CONFIG.api.quizCheckRegex.test(url)) {
        this.eventBus.emit(
          'network:quizResultLoaded',
          JSON.parse(text) as QuizResultData,
        );
      }
    } catch (e) {
      Logger.error('Response handling error:', e);
    }
  }

  private patchXHR(): void {
    const self = this;
    const origOpen = XMLHttpRequest.prototype.open;

    XMLHttpRequest.prototype.open = function (
      this: XMLHttpRequest & { _unix_patched?: boolean },
      _method: string,
      url: string | URL,
      ...rest: unknown[]
    ) {
      if (!this._unix_patched) {
        const capturedUrl = String(url);
        this.addEventListener('load', function () {
          self.handleResponse(capturedUrl, this.responseText);
        });
        this._unix_patched = true;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (origOpen as any).apply(this, [_method, url, ...rest]);
    } as typeof XMLHttpRequest.prototype.open;
  }

  private patchFetch(): void {
    const self = this;
    const origFetch = window.fetch;

    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const res = await origFetch(...args);

      try {
        const url = res.url;
        if (
          CONFIG.api.lessonInfoRegex.test(url) ||
          CONFIG.api.quizQuestionsRegex.test(url) ||
          CONFIG.api.quizCheckRegex.test(url)
        ) {
          res
            .clone()
            .text()
            .then((text) => self.handleResponse(url, text))
            .catch((e) => Logger.error('Fetch clone error:', e));
        }
      } catch (e) {
        Logger.error('Sniffer logic error:', e);
      }

      return res;
    };
  }
}
