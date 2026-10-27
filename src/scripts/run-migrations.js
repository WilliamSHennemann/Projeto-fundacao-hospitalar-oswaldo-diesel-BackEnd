import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { databaseConfigured, pool } from '../config/database.js';

async function main() {
  if (!databaseConfigured) throw new Error('Configure DATABASE_URL ou DB_HOST, DB_USER e DB_PASSWORD antes de migrar.');
  const migrationsDir = resolve(process.cwd(), 'database/migrations');
  const migrationFiles = (await readdir(migrationsDir)).filter((file) => /^\d+_.*\.sql$/.test(file)).sort();
  const client = await pool.connect();
  try {
    for (const file of migrationFiles) {
      await client.query('BEGIN');
      try {
        await client.query(await readFile(resolve(migrationsDir, file), 'utf8'));
        await client.query('COMMIT');
        console.log('Migração aplicada:', file);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Falha ao preparar migrações:', error);
  process.exit(1);
});
