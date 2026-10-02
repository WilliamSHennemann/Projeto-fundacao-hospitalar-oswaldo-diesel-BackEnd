import { Router } from 'express';
import { z } from 'zod';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  senha: z.string().min(4),
});

export const requireAuth = (req, _res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return next(new Error('Token ausente'));
  }
  req.user = { id: 1, perfil: 'super_admin', email: 'super@fundacao.com' };
  return next();
};

export const requirePermission = (permission, scope) => (req, _res, next) => {
  if (!req.user) {
    return next(new Error('Não autenticado'));
  }
  if (permission === 'ouvidoria' || permission === 'gestao' || permission === 'super_admin') {
    return next();
  }
  if (scope === 'setor' && req.user.setor_id) {
    return next();
  }
  return next(new Error('Permissão insuficiente'));
};

router.post('/auth/login', (req, res) => {
  const payload = loginSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ erro: 'Dados inválidos', codigo: 'VALIDATION_ERROR', detalhes: payload.error.flatten() });
  }

  return res.json({
    token: 'demo-token',
    usuario: {
      id: 1,
      nome: 'Super Admin',
      email: payload.data.email,
      perfil: 'super_admin',
    },
  });
});

router.get('/auth/me', requireAuth, (req, res) => {
  res.json({ usuario: req.user });
});

export default router;
