import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // Three.js is the core renderer here, so the default 500 kB warning is noisy for this prototype.
    chunkSizeWarningLimit: 800,
  },
});
