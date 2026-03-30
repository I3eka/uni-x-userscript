import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@core': resolve(__dirname, 'src/core'),
      '@features': resolve(__dirname, 'src/features'),
      '@app': resolve(__dirname, 'src/app'),
    },
  },
  plugins: [
    monkey({
      entry: 'src/main.ts',
      userscript: {
        name: 'Mark Video Watched & Tools (Auto + Manual Fallback)',
        namespace: 'http://tampermonkey.net/',
        version: '5.0',
        description:
          'Отмечает видео (авто-генерация или ручной перехват), копирует вопросы, кэширует ответы.',
        author: 'I3eka',
        match: ['https://uni-x.almv.kz/*'],
        icon: 'https://github.com/I3eka/uni-x-userscript/raw/main/public/logo.svg',
        connect: ['uni-x.almv.kz', 'workers.dev'],
        homepageURL: 'https://github.com/I3eka/uni-x-userscript',
        supportURL: 'https://github.com/I3eka/uni-x-userscript/issues',
        downloadURL:
          'https://github.com/I3eka/uni-x-userscript/raw/main/uni-x-full.user.js',
        updateURL:
          'https://github.com/I3eka/uni-x-userscript/raw/main/uni-x-full.user.js',
        'run-at': 'document-start',
      },
      build: {
        externalGlobals: {},
      },
    }),
  ],
});
