import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import bcrypt from 'bcryptjs';
import { databaseConfigured, pool } from '../config/database.js';

async function main() {
  if (!databaseConfigured) {
    throw new Error('Configure DATABASE_URL ou DB_HOST, DB_USER e DB_PASSWORD antes de executar o seed.');
  }

  const seedPath = resolve(process.cwd(), 'database/seed.sql');
  const sql = await readFile(seedPath, 'utf8');
  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (Boolean(adminEmail) !== Boolean(adminPassword)) {
    throw new Error('Defina SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD juntos, ou deixe ambos vazios.');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    if (adminEmail && adminPassword) {
      const passwordHash = await bcrypt.hash(adminPassword, 12);
      await client.query(
        `INSERT INTO usuario (nome, email, perfil_id, ativo, senha_hash)
         VALUES ($1, LOWER($2), 1, TRUE, $3)
         ON CONFLICT (email)
         DO UPDATE SET nome = EXCLUDED.nome, perfil_id = 1, ativo = TRUE, senha_hash = EXCLUDED.senha_hash`,
        [process.env.SEED_ADMIN_NAME ?? 'Administrador', adminEmail, passwordHash],
      );
      console.log(`Administrador inicial criado/atualizado: ${adminEmail}`);
    } else {
      console.warn('Seed sem administrador: defina SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD para habilitar o login.');
    }
    await client.query('COMMIT');
    console.log('Seed aplicado:', seedPath);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Falha ao preparar seed:', error);
  process.exit(1);
});
