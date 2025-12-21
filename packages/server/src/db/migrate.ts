import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db, sqlite } from './index.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

console.log('Running migrations...');

migrate(db, { migrationsFolder: join(__dirname, 'migrations') });

console.log('Migrations completed successfully');

sqlite.close();
