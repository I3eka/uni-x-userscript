/**
 * System Tools Plugin
 *
 * Two independent utilities that don't need EventBus events:
 * 1. Tab-focus spoofing — prevents the platform from detecting tab switches
 * 2. Click-to-copy — copies question+answer blocks to clipboard on click
 */

import type { IPlugin, IPluginContext } from '@core/plugin';
import { GM_setClipboard } from '$';
import { CONFIG } from '@shared/config';
import { showToast } from '@shared/ui/toast';
import { Logger } from '@shared/utils/logger';

export class SystemToolsPlugin implements IPlugin {
  readonly name = 'SystemTools';

  init(_context: IPluginContext): void {
    this.hackActiveTab();
    this.initClickToCopy();
  }

  /* ─── Tab-focus spoofing ─── */

  private hackActiveTab(): void {
    const stop = (e: Event): void => {
      e.stopImmediatePropagation();
      e.stopPropagation();
    };

    const events = [
      'blur',
      'visibilitychange',
      'webkitvisibilitychange',
      'mozvisibilitychange',
      'msvisibilitychange',
    ];

    for (const evt of events) {
      window.addEventListener(evt, stop, true);
      document.addEventListener(evt, stop, true);
    }

    try {
      Object.defineProperty(document, 'visibilityState', {
        get: () => 'visible',
        configurable: true,
      });
      Object.defineProperty(document, 'hidden', {
        get: () => false,
        configurable: true,
      });
    } catch (e) {
      Logger.error('Visibility hack error:', e);
    }
  }

  /* ─── Click-to-copy ─── */

  private initClickToCopy(): void {
    document.body.addEventListener(
      'click',
      (e: MouseEvent) => {
        const target = e.target as HTMLElement;

        // Don't interfere with text selections
        if ((window.getSelection()?.toString().length ?? 0) > 0) return;

        const targetBlock = target.closest<HTMLElement>(
          CONFIG.selectors.copyBlock,
        );
        const isExcluded = target.closest(CONFIG.selectors.excludeCopy);

        if (targetBlock && !isExcluded) {
          e.preventDefault();
          e.stopImmediatePropagation();

          const question =
            targetBlock.querySelector<HTMLElement>(
              CONFIG.selectors.questionText,
            )?.innerText ?? '';

          const answers = Array.from(
            targetBlock.querySelectorAll<HTMLElement>(
              CONFIG.selectors.answerContainer,
            ),
          )
            .map((d) => d.innerText.replace(/\s+/g, ' ').trim())
            .join('\n');

          if (question || answers) {
            GM_setClipboard(`${question}\n${answers}`.trim(), 'text');
            showToast('\uD83D\uDCCB Скопировано!');

            // Brief visual feedback
            const originalOutline = targetBlock.style.outline;
            targetBlock.style.outline = `4px solid ${CONFIG.ui.colors.success}`;
            setTimeout(() => {
              targetBlock.style.outline = originalOutline;
            }, 200);
          }
        }
      },
      true,
    );
  }
}
