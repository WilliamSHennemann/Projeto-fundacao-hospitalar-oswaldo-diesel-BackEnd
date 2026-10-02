import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { errorResponse } from './shared/errors.js';
import { openApiDocument } from './openapi.js';

import pesquisaRoutes from './modules/pesquisa/pesquisa.routes.js';
import ouvidoriaRoutes from './modules/ouvidoria/ouvidoria.routes.js';
import dashboardRoutes from './modules/dashboard/dashboard.routes.js';
import tvwallRoutes from './modules/tvwall/tvwall.routes.js';
import exportacaoRoutes from './modules/exportacao/exportacao.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';
import authRoutes from './modules/auth/auth.routes.js';

export const app = express();

app.use(helmet());
app.use(
  cors({
    origin: env.corsOrigin === '*' ? true : env.corsOrigin.split(',').map((item) => item.trim()),
    credentials: true,
  }),
);
app.use(express.json({ limit: '1mb' }));
app.use(
  rateLimit({
    windowMs: env.rateLimitWindowMs,
    max: env.rateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'sgep-backend' });
});

app.get('/docs', (_req, res) => {
  res.json(openApiDocument);
});

app.use('/api', authRoutes);
app.use('/api', pesquisaRoutes);
app.use('/api', ouvidoriaRoutes);
app.use('/api', dashboardRoutes);
app.use('/api', tvwallRoutes);
app.use('/api', exportacaoRoutes);
app.use('/api', adminRoutes);

app.use((error, _req, res, _next) => {
  const payload = errorResponse(error);
  const statusCode = error?.statusCode ?? error?.status ?? 500;
  res.status(statusCode).json(payload);
});

export default app;
