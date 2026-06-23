import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const rootDir = __dirname;

export default defineConfig({
  plugins: [react()],
  base: './',
  root: path.join(rootDir, 'src/renderer'),
  publicDir: path.join(rootDir, 'public'),
  build: {
    outDir: path.join(rootDir, 'dist/renderer'),
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': path.join(rootDir, 'src/renderer'),
      '@shared': path.join(rootDir, 'src/shared'),
    },
  },
});
