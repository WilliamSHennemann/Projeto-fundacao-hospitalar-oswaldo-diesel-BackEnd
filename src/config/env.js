import dotenv from 'dotenv';

dotenv.config();

export const env = {
  port: Number(process.env.PORT ?? 3000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  databaseUrl: process.env.DATABASE_URL,
  dbHost: process.env.DB_HOST,
  dbPort: Number(process.env.DB_PORT ?? 5432),
  dbName: process.env.DB_NAME ?? 'postgres',
  dbUser: process.env.DB_USER,
  dbPassword: process.env.DB_PASSWORD,
  dbSsl: (process.env.DB_SSL ?? 'true').toLowerCase() !== 'false',
  dbSslCa: process.env.DB_SSL_CA?.replace(/\\n/g, '\n'),
  jwtSecret: process.env.JWT_SECRET ?? 'change-me',
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60000),
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX ?? 120),
};

if (env.nodeEnv === 'production') {
  if (!env.databaseUrl && !(env.dbHost && env.dbUser && env.dbPassword)) {
    throw new Error('DATABASE_URL ou as variáveis DB_* são obrigatórias em produção.');
  }
  if (!env.corsOrigin || env.corsOrigin === '*') {
    throw new Error('CORS_ORIGIN deve apontar para o domínio do frontend em produção.');
  }
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || process.env.JWT_SECRET === 'change-me') {
    throw new Error('JWT_SECRET deve ter pelo menos 32 caracteres em produção.');
  }
}
