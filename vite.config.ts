import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Ignore runtime and server-generated directories so file writes (logs, cache, projects, exports)
      // do not cause endless auto-refresh loops when running via CLI on PC.
      watch:
        process.env.DISABLE_HMR === 'true'
          ? null
          : {
              ignored: [
                '**/cache/**',
                '**/logs/**',
                '**/projects/**',
                '**/auto_import/**',
                '**/installer/**',
                '**/dist/**',
                '**/*.log',
                '**/*.tmp',
                '**/.git/**',
                '**/*.json',
                '**/*.bat',
                '**/*.iss',
                '**/*.cs',
                '**/*.py',
                '**/server.ts',
              ],
            },
    },
  };
});
