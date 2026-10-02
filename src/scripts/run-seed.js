import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

async function main() {
  const seedPath = resolve(process.cwd(), 'database/seed.sql');
  const sql = await readFile(seedPath, 'utf8');
  console.log('Seed SQL carregado:', seedPath);
  console.log('Tamanho:', sql.length, 'bytes');
  console.log('Pronto para executar no PostgreSQL do Supabase.');
}

main().catch((error) => {
  console.error('Falha ao preparar seed:', error);
  process.exit(1);
});
