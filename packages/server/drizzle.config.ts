import { defineConfig } from 'drizzle-kit';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  schema: resolve(__dirname, './src/db/schema.ts'),
  out: resolve(__dirname, './src/db/migrations'),
  dialect: 'sqlite',
  dbCredentials: {
    url: resolve(__dirname, '../../data/ace-prep.db'),
  },
});
