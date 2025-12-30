import { defineConfig } from 'drizzle-kit';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const currentDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  schema: resolve(currentDir, './src/db/schema.ts'),
  out: resolve(currentDir, './src/db/migrations'),
  dialect: 'sqlite',
  dbCredentials: {
    url: resolve(currentDir, '../../data/ace-prep.db'),
  },
});
