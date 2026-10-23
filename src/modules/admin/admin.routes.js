import { Router } from 'express';
import { z } from 'zod';
import { appStore } from '../../shared/store.js';
import { requireAuth, requirePermission } from '../auth/auth.routes.js';
import { asyncHandler, databaseConfigured, query } from '../../config/database.js';

const router = Router();

const setorSchema = z.object({
  nome: z.string().min(2),
  slug: z.string().min(2).optional(),
  ativo: z.boolean().optional().default(true),
});

router.get('/admin/setores', requireAuth, requirePermission('super_admin'), asyncHandler(async (_req, res) => {
  if (databaseConfigured) {
    const result = await query('SELECT * FROM setor ORDER BY id');
    return res.json(result.rows);
  }
  res.json(appStore.setores);
}));

router.post('/admin/setores', requireAuth, requirePermission('super_admin'), asyncHandler(async (req, res) => {
  const payload = setorSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ erro: 'Dados inválidos', codigo: 'VALIDATION_ERROR', detalhes: payload.error.flatten() });
  }

  const slug = payload.data.slug ?? payload.data.nome.toLowerCase().replace(/\s+/g, '-');
  if (databaseConfigured) {
    const result = await query(
      `INSERT INTO setor (hospital_id, nome, slug, url, qrcode, ativo)
       VALUES (1, $1, $2, $3, $4, $5)
       RETURNING *`,
      [payload.data.nome, slug, `/setores/${slug}`, `qr-${slug}`, payload.data.ativo],
    );
    return res.status(201).json(result.rows[0]);
  }

  const setor = {
    id: appStore.setores.length + 1,
    hospital_id: 1,
    nome: payload.data.nome,
    slug,
    url: `/setores/${slug}`,
    qrcode: `qr-${slug}`,
    ativo: payload.data.ativo,
  };

  appStore.setores.push(setor);
  return res.status(201).json(setor);
}));

router.get('/admin/perfis', requireAuth, requirePermission('super_admin'), asyncHandler(async (_req, res) => {
  if (databaseConfigured) {
    const result = await query('SELECT id, nome, permissoes FROM perfil ORDER BY id');
    return res.json(result.rows);
  }
  res.json(appStore.perfis);
}));

router.get('/admin/usuarios', requireAuth, requirePermission('super_admin'), asyncHandler(async (_req, res) => {
  if (databaseConfigured) {
    const result = await query(
      `SELECT u.id, u.nome, u.email, u.perfil_id, u.setor_id, u.ativo,
              COALESCE(p.permissoes->'roles', '[]'::json) AS permissoes
       FROM usuario u JOIN perfil p ON p.id = u.perfil_id
       ORDER BY u.id`,
    );
    return res.json(result.rows);
  }
  res.json(appStore.usuarios.map(({ senha_hash, ...user }) => user));
}));

export default router;
