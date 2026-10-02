import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

async function main() {
  const migrationPath = resolve(process.cwd(), 'database/migrations/001_sgep_schema.sql');
  const sql = await readFile(migrationPath, 'utf8');
  console.log('SQL de migração carregado:', migrationPath);
  console.log('Tamanho:', sql.length, 'bytes');
  console.log('Pronto para executar no PostgreSQL do Supabase.');
}

main().catch((error) => {
  console.error('Falha ao preparar migrações:', error);
  process.exit(1);
});
