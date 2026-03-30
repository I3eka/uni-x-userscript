import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
      '@core': fileURLToPath(new URL('./src/core', import.meta.url)),
      '@features': fileURLToPath(new URL('./src/features', import.meta.url)),
      '@app': fileURLToPath(new URL('./src/app', import.meta.url)),
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
