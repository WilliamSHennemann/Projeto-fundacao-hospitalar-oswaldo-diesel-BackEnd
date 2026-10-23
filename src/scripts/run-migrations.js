import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { databaseConfigured, pool } from '../config/database.js';

async function main() {
  if (!databaseConfigured) {
    throw new Error('Configure DATABASE_URL ou DB_HOST, DB_USER e DB_PASSWORD antes de migrar.');
  }

  const migrationPath = resolve(process.cwd(), 'database/migrations/001_sgep_schema.sql');
  const sql = await readFile(migrationPath, 'utf8');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('Migração aplicada:', migrationPath);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Falha ao preparar migrações:', error);
  process.exit(1);
});
