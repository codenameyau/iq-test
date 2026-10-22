import { defineConfig } from 'vite';

export default defineConfig({
  // Relative paths, then inlined into one file so dist/index.html opens on its own.
  base: './',
  build: {
    cssCodeSplit: false,
    modulePreload: false,
    assetsInlineLimit: 100_000_000,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        format: 'iife',
        entryFileNames: 'app.js',
        assetFileNames: 'app.[ext]',
      },
    },
  },
});
