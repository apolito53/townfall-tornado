import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // Three.js is the core renderer here, so the default 500 kB warning is noisy for this prototype.
    chunkSizeWarningLimit: 800,
  },
  server: {
    host: '127.0.0.1',
    port: 5175,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4175,
    strictPort: true,
  },
});
