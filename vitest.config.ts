import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

const fake = (name: string) => path.resolve(__dirname, `src/test/fakes/${name}.ts`);

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Order matters: the specific Firebase entry points must win over the
    // catch-all '@/' alias.
    alias: [
      // The app talks to in-memory fakes. Tests import those same modules, so
      // seeding data and asserting on writes works against one shared store —
      // no per-file vi.mock boilerplate.
      { find: /^@\/lib\/firebase$/, replacement: fake('firebase-app') },
      { find: /^firebase\/database$/, replacement: fake('firebase-database') },
      { find: /^firebase\/auth$/, replacement: fake('firebase-auth') },
      { find: /^@\//, replacement: `${path.resolve(__dirname, 'src')}/` },
    ],
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
    // Pages mount several Firebase listeners; give them room on a cold run.
    testTimeout: 15_000,
    env: {
      VITE_TELLER_APP_ID: 'test_app_id',
      VITE_TELLER_ENVIRONMENT: 'sandbox',
      VITE_USE_FIREBASE_EMULATORS: 'false',
    },
  },
});
