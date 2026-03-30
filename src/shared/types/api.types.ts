/**
 * API response type definitions.
 *
 * These interfaces model the JSON payloads intercepted from the platform's
 * XHR / Fetch network traffic. Fields are nullable because the backend
 * serves different subsets depending on the user's locale.
 */

/* ────── Lesson / Video ────── */

export interface LessonData {
  id: number;
  isWatched: boolean;
  videoDurationEn?: number;
  videoDurationKz?: number;
  videoDurationRu?: number;
  [key: string]: unknown;
}

/* ────── Quiz Questions (loaded on quiz page) ────── */

interface QuizQuestion {
  questionText?: string;
  questionTextRu?: string;
  questionTextKz?: string;
  answers?: QuizAnswer[];
}

export interface QuizQuestionsData {
  questions: QuizQuestion[];
  [key: string]: unknown;
}

/* ────── Quiz Result (returned after /check) ────── */

interface QuizAnswer {
  answerText?: string;
  answerTextRu?: string;
  answerTextKz?: string;
  isCorrect?: boolean;
}

interface QuizHistoryItem {
  questionText?: string;
  questionTextRu?: string;
  questionTextKz?: string;
  correctAnswerText?: string;
  answers?: QuizAnswer[];
}

export interface QuizResultData {
  questionsWithCorrectAnswers?: QuizHistoryItem[];
  history?: QuizHistoryItem[];
  [key: string]: unknown;
}

/* ────── Cloud API ────── */

/** Hash → array of correct answer strings */
export type CloudAnswersMap = Record<string, string[]>;

/** Question text → array of correct answer strings (local cache format) */
export type QuizCache = Record<string, string[]>;
