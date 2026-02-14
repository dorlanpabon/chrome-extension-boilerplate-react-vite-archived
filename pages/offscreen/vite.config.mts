import { defineConfig } from 'vite';
import { withPageConfig } from '@extension/vite-config';

export default defineConfig(
  withPageConfig({
    resolve: {
      alias: {
        '@src': new URL('./src', import.meta.url).pathname,
      },
    },
    publicDir: 'public',
    build: {
      outDir: 'dist',
      rollupOptions: {
        input: {
          offscreen: new URL('./index.html', import.meta.url).pathname,
        },
      },
    },
  }),
);
