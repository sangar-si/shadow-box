
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // This ensures all assets use relative paths, essential for GitHub Pages
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  }
});
