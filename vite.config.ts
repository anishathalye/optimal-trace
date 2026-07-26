/// <reference types="vitest/config" />
import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

let commitHash: string;
try {
  commitHash = execSync('git rev-parse --short HEAD', {
    encoding: 'utf-8',
  }).trim();
} catch {
  commitHash = 'dev';
}

export default defineConfig({
  plugins: [react()],
  define: {
    __COMMIT_HASH__: JSON.stringify(commitHash),
  },
  test: {
    globals: true,
  },
});
