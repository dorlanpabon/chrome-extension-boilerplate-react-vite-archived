import { defineConfig } from 'vite';
import { withPageConfig } from '@extension/vite-config';
import { resolve } from 'node:path';

const rootDir = resolve(import.meta.dirname);
const outDir = resolve(rootDir, '..', '..', 'dist', 'offscreen');

export default defineConfig(
  withPageConfig({
    resolve: {
      alias: {
        '@src': resolve(rootDir, 'src'),
      },
    },
    publicDir: resolve(rootDir, 'public'),
    build: {
      outDir,
      rollupOptions: {
        input: {
          offscreen: resolve(rootDir, 'index.html'),
        },
      },
    },
  }),
);
