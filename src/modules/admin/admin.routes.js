import { Router } from 'express';
import { z } from 'zod';
import { appStore } from '../../shared/store.js';
import { requireAuth, requirePermission } from '../auth/auth.routes.js';

const router = Router();

const setorSchema = z.object({
  nome: z.string().min(2),
  slug: z.string().min(2).optional(),
  ativo: z.boolean().optional().default(true),
});

router.get('/admin/setores', requireAuth, requirePermission('super_admin'), (_req, res) => {
  res.json(appStore.setores);
});

router.post('/admin/setores', requireAuth, requirePermission('super_admin'), (req, res) => {
  const payload = setorSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ erro: 'Dados inválidos', codigo: 'VALIDATION_ERROR', detalhes: payload.error.flatten() });
  }

  const setor = {
    id: appStore.setores.length + 1,
    hospital_id: 1,
    nome: payload.data.nome,
    slug: payload.data.slug ?? payload.data.nome.toLowerCase().replace(/\s+/g, '-'),
    url: `/setores/${payload.data.slug ?? payload.data.nome.toLowerCase().replace(/\s+/g, '-')}`,
    qrcode: `qr-${payload.data.slug ?? payload.data.nome.toLowerCase().replace(/\s+/g, '-')}`,
    ativo: payload.data.ativo,
  };

  appStore.setores.push(setor);
  return res.status(201).json(setor);
});

router.get('/admin/perfis', requireAuth, requirePermission('super_admin'), (_req, res) => {
  res.json(appStore.perfis);
});

router.get('/admin/usuarios', requireAuth, requirePermission('super_admin'), (_req, res) => {
  res.json(appStore.usuarios);
});

export default router;
