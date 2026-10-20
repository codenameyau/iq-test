import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the built site works from any static host or sub-path.
  base: './',
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:3300',
    },
  },
});
