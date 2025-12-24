import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/db/migrate.ts',
        'src/db/seed.ts',
        'src/db/setup.ts',
        'src/index.ts',
      ],
    },
    // ESM support
    alias: {
      '@ace-prep/shared': '../shared/src/index.ts',
    },
  },
});
