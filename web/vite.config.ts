import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: '/climate-citizen-platform-sim/',
  plugins: [react()],
  resolve: { alias: { '@shared': fileURLToPath(new URL('../shared/src', import.meta.url)) } },
  server: { port: 5173, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true },
});
