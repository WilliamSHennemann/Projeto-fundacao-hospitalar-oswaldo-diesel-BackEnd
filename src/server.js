import app from './app.js';
import { env } from './config/env.js';
import { databaseConfigured, pool } from './config/database.js';

const port = env.port;

async function start() {
  if (env.nodeEnv === 'production' && !databaseConfigured) {
    throw new Error('Configure DATABASE_URL ou DB_HOST, DB_USER e DB_PASSWORD para produção.');
  }
  if (env.nodeEnv === 'production' && (env.jwtSecret === 'change-me' || env.jwtSecret.length < 32)) {
    throw new Error('Configure JWT_SECRET com pelo menos 32 caracteres aleatórios para produção.');
  }

  if (pool) {
    await pool.query('SELECT 1');
    console.log('PostgreSQL connection established.');
  }

  app.listen(port, () => {
    console.log(`SGEP API listening on port ${port}`);
  });
}

start().catch((error) => {
  console.error('Failed to start SGEP API:', error);
  process.exit(1);
});
