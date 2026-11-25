import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { AppError } from '../../shared/errors.js';
import { appStore } from '../../shared/store.js';
import { asyncHandler, databaseConfigured, query } from '../../config/database.js';

const router = Router();
const loginLimiter = rateLimit({
  windowMs: env.loginRateLimitWindowMs,
  max: env.loginRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}:${String(req.body?.email ?? '').trim().toLowerCase()}`,
  handler: (_req, res) => res.status(429).json({
    erro: 'Muitas tentativas. Aguarde alguns minutos.',
    codigo: 'RATE_LIMITED',
  }),
});
const fakePasswordHash = bcrypt.hashSync('senha-falsa-para-tempo-constante', 10);

const loginSchema = z.object({
  email: z.string().email(),
  senha: z.string().min(4),
});

const getProfilePermissions = (user) => {
  const perfil = appStore.perfis.find((item) => item.id === user.perfil_id) ?? appStore.perfis.find((item) => item.nome.toLowerCase().replace(/\s+/g, '_') === user.perfil);
  return perfil?.permissoes ?? [];
};

const normalizeUser = (user) => ({
  id: user.id,
  nome: user.nome,
  email: user.email,
  perfil: user.perfil ?? user.permissoes?.[0] ?? 'super_admin',
  setor_id: user.setor_id ?? null,
  ativo: user.ativo,
  permissoes: Array.isArray(user.permissoes) ? user.permissoes : getProfilePermissions(user),
});

export const issueToken = (user) =>
  jwt.sign(
    {
      sub: user.id,
      email: user.email,
      perfil: user.perfil,
      setor_id: user.setor_id ?? null,
      permissoes: user.permissoes,
    },
    env.jwtSecret,
    { expiresIn: '8h' },
  );

export const requireAuth = asyncHandler(async (req, _res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.replace(/^Bearer\s+/i, '') : null;

  if (!token) {
    return next(new AppError('Token ausente', 401, 'TOKEN_MISSING'));
  }

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch (_error) {
    return next(new AppError('Token inválido ou expirado', 401, 'INVALID_TOKEN'));
  }

  if (databaseConfigured) {
    const result = await query(
      `SELECT u.id, u.nome, u.email, u.setor_id, u.ativo,
              COALESCE(p.permissoes->'roles', '[]'::jsonb) AS permissoes
       FROM usuario u
       JOIN perfil p ON p.id = u.perfil_id
       WHERE u.id = $1 AND u.ativo = TRUE`,
      [Number(payload.sub)],
    );
    if (!result.rowCount) return next(new AppError('Usuário não encontrado', 401, 'USER_NOT_FOUND'));
    req.user = normalizeUser(result.rows[0]);
    return next();
  }

  const user = appStore.usuarios.find((item) => item.id === Number(payload.sub) && item.ativo);
  if (!user) {
    return next(new AppError('Usuário não encontrado', 401, 'USER_NOT_FOUND'));
  }
  req.user = normalizeUser(user);
  return next();
});

export const requirePermission = (permission, scope) => (req, _res, next) => {
  if (!req.user) {
    return next(new AppError('Não autenticado', 401, 'UNAUTHORIZED'));
  }

  const permissions = new Set(req.user.permissoes ?? []);

  if (permissions.has('super_admin') || permissions.has(permission)) {
    return next();
  }

  if (scope === 'setor' && req.user.setor_id) {
    return next();
  }

  return next(new AppError('Permissão insuficiente', 403, 'FORBIDDEN'));
};

export const requireAnyPermission = (...permissions) => (req, _res, next) => {
  if (!req.user) return next(new AppError('NÃ£o autenticado', 401, 'UNAUTHORIZED'));
  const granted = new Set(req.user.permissoes ?? []);
  if (granted.has('super_admin') || permissions.some((permission) => granted.has(permission) || (permission === 'visu' && granted.has('visualizador')))) return next();
  return next(new AppError('PermissÃ£o insuficiente', 403, 'FORBIDDEN'));
};

export const enforceUserSectorScope = (sectorParam) => (req, _res, next) => {
  const permissions = new Set(req.user?.permissoes ?? []);
  if (!permissions.has('gestao') || permissions.has('super_admin')) return next();

  const sectorId = Number(req.user.setor_id);
  if (!Number.isInteger(sectorId) || sectorId < 1) {
    return next(new AppError('Usuário de gestão precisa estar vinculado a um setor', 403, 'SECTOR_REQUIRED'));
  }

  const requestedSectors = [req.query?.setor_id, sectorParam ? req.params?.[sectorParam] : undefined]
    .filter((value) => value !== undefined);
  if (requestedSectors.some((requestedSector) => Number(requestedSector) !== sectorId)) {
    return next(new AppError('Acesso permitido somente ao setor vinculado ao usuário', 403, 'SECTOR_FORBIDDEN'));
  }

  if (req.query) req.query.setor_id = String(sectorId);
  next();
};

router.post('/auth/login', loginLimiter, asyncHandler(async (req, res) => {
  const payload = loginSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ erro: 'Dados inválidos', codigo: 'VALIDATION_ERROR', detalhes: payload.error.flatten() });
  }

  let user;
  if (databaseConfigured) {
    const result = await query(
      `SELECT u.id, u.nome, u.email, u.setor_id, u.ativo, u.senha_hash,
              COALESCE(p.permissoes->'roles', '[]'::jsonb) AS permissoes
       FROM usuario u
       JOIN perfil p ON p.id = u.perfil_id
       WHERE LOWER(u.email) = LOWER($1) AND u.ativo = TRUE`,
      [payload.data.email],
    );
    user = result.rows[0];
  } else {
    user = appStore.usuarios.find(
      (item) => item.email.toLowerCase() === payload.data.email.toLowerCase() && item.ativo,
    );
  }

  if (!user) {
    await bcrypt.compare(payload.data.senha, fakePasswordHash);
    return res.status(401).json({ erro: 'Credenciais inválidas', codigo: 'INVALID_CREDENTIALS' });
  }

  const validPassword = await bcrypt.compare(payload.data.senha, user.senha_hash ?? '');
  if (!validPassword) {
    return res.status(401).json({ erro: 'Credenciais inválidas', codigo: 'INVALID_CREDENTIALS' });
  }

  const safeUser = normalizeUser(user);

  return res.json({
    token: issueToken(safeUser),
    usuario: {
      id: safeUser.id,
      nome: safeUser.nome,
      email: safeUser.email,
      perfil: safeUser.perfil,
      setor_id: safeUser.setor_id,
      permissoes: safeUser.permissoes,
    },
  });
}));

router.get('/auth/me', requireAuth, (req, res) => {
  res.json({ usuario: req.user });
});

router.post('/auth/senha', requireAuth, asyncHandler(async (req, res) => {
  const parsed = z.object({
    senha_atual: z.string().min(1),
    nova_senha: z.string().min(8).max(72),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: 'Dados inválidos', codigo: 'VALIDATION_ERROR', detalhes: parsed.error.flatten() });

  if (databaseConfigured) {
    const result = await query('SELECT senha_hash FROM usuario WHERE id = $1 AND ativo = TRUE', [req.user.id]);
    const hash = result.rows[0]?.senha_hash;
    if (!hash || !(await bcrypt.compare(parsed.data.senha_atual, hash))) {
      throw new AppError('Senha atual inválida', 400, 'INVALID_PASSWORD');
    }
    await query('UPDATE usuario SET senha_hash = $2 WHERE id = $1', [req.user.id, await bcrypt.hash(parsed.data.nova_senha, 10)]);
    return res.json({ ok: true });
  }
  const user = appStore.usuarios.find((item) => item.id === req.user.id && item.ativo);
  if (!user || !(await bcrypt.compare(parsed.data.senha_atual, user.senha_hash ?? ''))) {
    throw new AppError('Senha atual inválida', 400, 'INVALID_PASSWORD');
  }
  user.senha_hash = await bcrypt.hash(parsed.data.nova_senha, 10);
  return res.json({ ok: true });
}));

export default router;
