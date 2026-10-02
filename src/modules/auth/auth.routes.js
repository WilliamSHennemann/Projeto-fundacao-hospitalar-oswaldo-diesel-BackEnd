import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { AppError } from '../../shared/errors.js';
import { appStore } from '../../shared/store.js';

const router = Router();

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
  perfil: user.perfil ?? 'super_admin',
  setor_id: user.setor_id ?? null,
  ativo: user.ativo,
  permissoes: getProfilePermissions(user),
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

export const requireAuth = (req, _res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.replace(/^Bearer\s+/i, '') : null;

  if (!token) {
    return next(new AppError('Token ausente', 401, 'TOKEN_MISSING'));
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret);
    const user = appStore.usuarios.find((item) => item.id === Number(payload.sub));

    if (!user) {
      return next(new AppError('Usuário não encontrado', 401, 'USER_NOT_FOUND'));
    }

    req.user = normalizeUser(user);
    return next();
  } catch (_error) {
    return next(new AppError('Token inválido ou expirado', 401, 'INVALID_TOKEN'));
  }
};

export const requirePermission = (permission, scope) => (req, _res, next) => {
  if (!req.user) {
    return next(new AppError('Não autenticado', 401, 'UNAUTHORIZED'));
  }

  const permissions = new Set(req.user.permissoes ?? []);

  if (permissions.has(permission)) {
    return next();
  }

  if (scope === 'setor' && req.user.setor_id) {
    return next();
  }

  return next(new AppError('Permissão insuficiente', 403, 'FORBIDDEN'));
};

router.post('/auth/login', (req, res) => {
  const payload = loginSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ erro: 'Dados inválidos', codigo: 'VALIDATION_ERROR', detalhes: payload.error.flatten() });
  }

  const user = appStore.usuarios.find(
    (item) => item.email.toLowerCase() === payload.data.email.toLowerCase() && item.ativo,
  );

  if (!user) {
    return res.status(401).json({ erro: 'Credenciais inválidas', codigo: 'INVALID_CREDENTIALS' });
  }

  const validPassword = bcrypt.compareSync(payload.data.senha, user.senha_hash ?? '');
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
      permissoes: safeUser.permissoes,
    },
  });
});

router.get('/auth/me', requireAuth, (req, res) => {
  res.json({ usuario: req.user });
});

export default router;
