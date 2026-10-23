import pg from 'pg';
import { env } from './env.js';

const { Pool } = pg;

export const databaseConfigured = Boolean(
  env.databaseUrl || (env.dbHost && env.dbUser && env.dbPassword),
);

if (env.databaseUrl && env.dbHost) {
  throw new Error('Configure DATABASE_URL ou as variáveis DB_*, não ambas.');
}

if ((env.databaseUrl || env.dbHost || env.dbUser || env.dbPassword) && !databaseConfigured) {
  throw new Error('Configure DATABASE_URL ou DB_HOST, DB_USER e DB_PASSWORD.');
}

export const pool = databaseConfigured
  ? new Pool({
      ...(env.databaseUrl
        ? { connectionString: env.databaseUrl }
        : {
            host: env.dbHost,
            port: env.dbPort,
            database: env.dbName,
            user: env.dbUser,
            password: env.dbPassword,
          }),
      ssl: env.dbSsl,
      connectionTimeoutMillis: 10000,
    })
  : null;

export const query = (text, values) => {
  if (!pool) {
    throw new Error('Conexão com o banco não está configurada.');
  }
  return pool.query(text, values);
};

export const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);
