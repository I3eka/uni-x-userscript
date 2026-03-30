/**
 * Global CSS injection and header decoration.
 */

import { GM_addStyle } from '$';
import { CONFIG } from '@shared/config';

/** Mark the page header with a green bottom border to signal success. */
export function markHeaderSuccess(): void {
  const header = document.querySelector<HTMLElement>(CONFIG.selectors.header);
  if (header) {
    header.style.borderBottom = `5px solid ${CONFIG.ui.colors.success}`;
    header.style.transition = 'border-color 0.5s ease';
  }
}

/** Inject global userscript styles (selection override, highlighting, smart hover). */
export function injectStyles(): void {
  const { copyBlock, excludeCopy } = CONFIG.selectors;

  // Build smart hover selectors: highlight copy blocks unless the user
  // hovers over an excluded interactive child.
  const smartHoverRules = copyBlock
    .split(',')
    .map(
      (block) =>
        `${block.trim()}:hover:not(:has(${excludeCopy
          .split(',')
          .map((s) => s.trim() + ':hover')
          .join(', ')}))`,
    )
    .join(',\n');

  GM_addStyle(`
    * { -webkit-user-select: text !important; user-select: text !important; }

    .unix-correct-highlight {
      border: 2px solid ${CONFIG.ui.colors.success} !important;
      background-color: rgba(16, 185, 129, 0.1) !important;
      position: relative;
    }
    .unix-correct-highlight::after {
      content: '\\2705';
      position: absolute;
      right: 10px;
      top: 50%;
      transform: translateY(-50%);
      font-size: 1.2rem;
    }

    ${smartHoverRules} {
      outline: 2px solid ${CONFIG.ui.colors.success} !important;
      outline-offset: 4px;
      border-radius: 12px;
      cursor: copy !important;
      background-color: rgba(16, 185, 129, 0.05);
    }

    ${CONFIG.selectors.excludeCopy} {
      cursor: pointer !important;
    }
  `);
}
