/**
 * Quiz Solver Plugin
 *
 * Caches correct quiz answers locally (GM_setValue) and in the cloud
 * (Cloudflare Worker KV). On quiz load, fetches unknown answers from
 * the cloud; on quiz check, extracts newly revealed answers and uploads them.
 *
 * DOM highlighting via MutationObserver keeps the UI reactive as
 * the SPA re-renders question blocks.
 */

import type { IPlugin, IPluginContext } from '@core/plugin';
import type {
  QuizQuestionsData,
  QuizResultData,
  QuizHistoryItem,
  QuizCache,
  CloudAnswersMap,
} from '@shared/types/api.types';
import { CONFIG } from '@shared/config';
import { normalizeText, generateHash } from '@shared/utils';
import { showToast } from '@shared/ui/toast';
import { Logger } from '@shared/utils/logger';
import { GMStorage } from '@core/storage';
import { fetchCloudAnswers, saveCloudAnswers } from '@shared/api/cloud.api';

/** Extract { question, correctAnswers } from a quiz item, or null if unusable. */
function extractQA(
  q: QuizHistoryItem,
): { question: string; correctAnswers: string[] } | null {
  const question =
    q.questionText ?? q.questionTextRu ?? q.questionTextKz ?? '';
  if (!question) return null;

  const correct = (q.answers ?? []).filter((a) => a.isCorrect);

  if (correct.length) {
    return {
      question,
      correctAnswers: correct.map(
        (a) => a.answerText ?? a.answerTextRu ?? a.answerTextKz ?? '',
      ),
    };
  }

  if (q.correctAnswerText) {
    return { question, correctAnswers: [q.correctAnswerText] };
  }

  return null;
}

export class QuizSolverPlugin implements IPlugin {
  readonly name = 'QuizSolver';

  private cache: QuizCache = {};

  init(context: IPluginContext): void {
    this.cache = GMStorage.get<QuizCache>(CONFIG.storage.quizCache, {});
    this.initObserver();

    context.events.on('network:quizQuestionsLoaded', (data) =>
      this.fetchAnswersFromCloud(data),
    );
    context.events.on('network:quizResultLoaded', (data) =>
      this.processQuizData(data),
    );
  }

  /* ─── Cloud fetch on quiz start ─── */

  private async fetchAnswersFromCloud(data: QuizQuestionsData): Promise<void> {
    if (!data?.questions) return;

    // Build a map: hash → normalized question text (only for cache misses)
    const keysMap: Record<string, string> = {};

    for (const q of data.questions) {
      const normQ = normalizeText(
        q.questionText ?? q.questionTextRu ?? q.questionTextKz,
      ).replace(/^\d+\.\s*/, '');

      if (normQ && !this.cache[normQ]) {
        keysMap[generateHash(normQ)] = normQ;
      }
    }

    const keysToFetch = Object.keys(keysMap);
    if (keysToFetch.length === 0) {
      this.highlightAnswers(); // everything is cached locally
      return;
    }

    const cloudAnswers = await fetchCloudAnswers(keysToFetch);
    let addedCount = 0;

    for (const [hash, normQ] of Object.entries(keysMap)) {
      if (cloudAnswers[hash]) {
        this.cache[normQ] = cloudAnswers[hash]!;
        addedCount++;
      }
    }

    if (addedCount > 0) {
      GMStorage.set(CONFIG.storage.quizCache, this.cache);
      showToast(`\u2601\uFE0F База: Загружено ${addedCount} новых ответов!`);
    }

    // Always highlight — local cache may have hits even when cloud returns nothing
    this.highlightAnswers();
  }

  /* ─── Process quiz check result ─── */

  private processQuizData(data: QuizResultData): void {
    const passedAnswers = data.questionsWithCorrectAnswers ?? [];
    const historyItems = data.history ?? [];

    if (passedAnswers.length) {
      Logger.success('Тест сдан успешно.');
    }

    const itemsToProcess: { question: string; correctAnswers: string[] }[] = [];

    // ── Passed test: extract from questionsWithCorrectAnswers ──
    for (const q of passedAnswers) {
      const item = extractQA(q);
      if (item) itemsToProcess.push(item);
    }

    // ── Failed test: extract from history ──
    if (historyItems.length) {
      Logger.log('Сохраняем ответы из истории.');

      for (const q of historyItems) {
        const item = extractQA(q);
        if (item) itemsToProcess.push(item);
      }
    }

    let count = 0;
    const cloudPayload: CloudAnswersMap = {};

    for (const item of itemsToProcess) {
      const normQ = normalizeText(item.question).replace(/^\d+\.\s*/, '');
      if (!normQ) continue;

      const validAnswers = item.correctAnswers
        .map(normalizeText)
        .filter(Boolean);

      if (validAnswers.length && !this.cache[normQ]) {
        this.cache[normQ] = validAnswers;
        cloudPayload[generateHash(normQ)] = validAnswers;
        count++;
      }
    }

    if (count > 0) {
      GMStorage.set(CONFIG.storage.quizCache, this.cache);
      showToast(`\uD83E\uDDE0 Сохранено ответов: ${count}`);
      this.highlightAnswers();
      saveCloudAnswers(cloudPayload).catch(() => {
        showToast('⚠️ Облачная синхронизация не удалась');
      });
    }
  }

  /* ─── DOM highlighting ─── */

  private highlightAnswers(): void {
    const questions = document.querySelectorAll<HTMLElement>(
      CONFIG.selectors.questionText,
    );

    for (const qEl of questions) {
      const qText = normalizeText(qEl.innerText).replace(/^\d+\.\s*/, '');
      const answers = this.cache[qText];
      if (!answers) continue;

      const container =
        qEl.closest<HTMLElement>('.bg-white') ??
        qEl.parentElement?.parentElement;
      if (!container) continue;

      const answerDivs = container.querySelectorAll<HTMLElement>(
        CONFIG.selectors.answerContainer,
      );

      for (const ansDiv of answerDivs) {
        if (ansDiv.classList.contains('unix-correct-highlight')) continue;

        const textEl =
          ansDiv.querySelector<HTMLElement>(CONFIG.selectors.answerText) ??
          ansDiv;
        const text = normalizeText(textEl.innerText);

        if (answers.includes(text)) {
          ansDiv.classList.add('unix-correct-highlight');
        }
      }
    }
  }

  /* ─── MutationObserver for SPA reactivity ─── */

  private initObserver(): void {
    new MutationObserver((mutations) => {
      const hasNewElements = mutations.some((m) =>
        Array.from(m.addedNodes).some((n) => n.nodeType === 1),
      );
      if (hasNewElements) {
        this.highlightAnswers();
      }
    }).observe(document.body, { childList: true, subtree: true });
  }
}
