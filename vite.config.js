import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/three/build/') || id.includes('/three/src/')) return 'three-core';
          if (id.includes('/three/examples/')) return 'three-effects';
        }
      }
    }
  }
});
