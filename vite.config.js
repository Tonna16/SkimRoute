import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import fs from 'node:fs';
import path from 'node:path';
import manifest from './manifest.json';

function copyPopupInjectionFiles() {
  const files = [
    'content/adapters.js',
    'content/engine.js',
    'content/ui.js',
    'content.js'
  ];

  return {
    name: 'pagepilot-copy-popup-injection-files',
    closeBundle() {
      files.forEach((file) => {
        const source = path.resolve(file);
        const target = path.resolve('dist', file);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(source, target);
      });
    }
  };
}

export default defineConfig({
  plugins: [crx({ manifest }), copyPopupInjectionFiles()],
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
