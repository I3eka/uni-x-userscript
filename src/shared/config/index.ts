/** Centralized application configuration — the single source of truth. */

interface AppConfig {
  readonly cloud: {
    readonly apiUrl: string;
  };
  readonly api: {
    readonly base: string;
    readonly lessonInfoRegex: RegExp;
    readonly quizQuestionsRegex: RegExp;
    readonly quizCheckRegex: RegExp;
  };
  readonly magicLesson: {
    readonly id: number;
  };
  readonly storage: {
    readonly videoToken: string;
    readonly videoState: string;
    readonly quizCache: string;
    readonly auth: string;
  };
  readonly delays: {
    readonly reloadSuccess: number;
    readonly reloadError: number;
    readonly toastLife: number;
  };
  readonly selectors: {
    readonly header: string;
    readonly questionText: string;
    readonly answerContainer: string;
    readonly answerText: string;
    readonly copyBlock: string;
    readonly excludeCopy: string;
  };
  readonly ui: {
    readonly colors: {
      readonly success: string;
      readonly error: string;
      readonly warn: string;
      readonly info: string;
    };
  };
}

export const CONFIG: AppConfig = {
  cloud: {
    apiUrl: 'https://unix-api.bexultan-mustafin.workers.dev',
  },
  api: {
    base: 'https://uni-x.almv.kz/api',
    lessonInfoRegex: /\/api\/lessons\/\d+(?:\?.*)?$/,
    quizQuestionsRegex: /\/api\/lessons\/\d+\/quiz(?:\?.*)?$/,
    quizCheckRegex: /\/api\/quizes\/.*\/check/,
  },
  magicLesson: {
    id: 15379,
  },
  storage: {
    videoToken: 'uniXVideoWatchToken',
    videoState: 'unix-video-state',
    quizCache: 'uniX_Quiz_Answers_Cache',
    auth: 'user-store',
  },
  delays: {
    reloadSuccess: 1000,
    reloadError: 1500,
    toastLife: 3000,
  },
  selectors: {
    header: 'h1',
    questionText: 'p.select-none',
    answerContainer: 'div.cursor-pointer[class*="rounded-"]',
    answerText: 'p.ml-4',
    copyBlock: '.md\\:pt-10.p-4.pr-1.bg-white, .rounded-b-xl.flex-col',
    excludeCopy:
      'p.select-none, div.cursor-pointer[class*="rounded-"], button, [role="button"]',
  },
  ui: {
    colors: {
      success: '#10b981',
      error: '#ef4444',
      warn: '#f59e0b',
      info: '#3b82f6',
    },
  },
} as const;
