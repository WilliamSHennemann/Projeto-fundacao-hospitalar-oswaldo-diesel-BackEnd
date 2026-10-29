import { Router } from 'express';
import { z } from 'zod';
import { appStore } from '../../shared/store.js';
import { AppError } from '../../shared/errors.js';
import { requireAuth, requireAnyPermission, requirePermission, enforceUserSectorScope } from '../auth/auth.routes.js';
import { asyncHandler, databaseConfigured, pool, query } from '../../config/database.js';

const router = Router();

const setorSchema = z.object({
  nome: z.string().min(2),
  slug: z.string().min(2).optional(),
  ativo: z.boolean().optional().default(true),
});

const setorPatchSchema = z.object({
  nome: z.string().min(2).optional(),
  slug: z.string().min(2).optional(),
  ativo: z.boolean().optional(),
}).refine((setor) => Object.keys(setor).length > 0, {
  message: 'Informe ao menos um campo para atualizar',
});

const normalizeSetorSlug = (value) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

const perguntaBaseSchema = z.object({
  texto: z.string().min(3), tipo: z.enum(['rostinho', 'texto', 'multipla', 'nps']),
  setor_id: z.number().int().positive().nullable().optional(), geral: z.boolean().optional().default(false),
  todos_setores: z.boolean().optional().default(false),
  ordem: z.number().int().positive(), obrigatoria: z.boolean().optional().default(false), ativo: z.boolean().optional().default(true),
  opcoes: z.array(z.object({ valor: z.number().int(), rotulo: z.string().min(1), emoji: z.string().optional() })).optional().default([]),
}).refine((p) => new Set(p.opcoes.map((option) => option.valor)).size === p.opcoes.length, { message: 'Os valores das opções não podem se repetir', path: ['opcoes'] })
  .refine((p) => p.geral
    ? p.setor_id == null && !p.todos_setores && p.tipo === 'nps' && p.obrigatoria
    : p.tipo !== 'nps' && (p.todos_setores ? p.setor_id == null : Number.isInteger(p.setor_id)), {
    message: 'NPS deve ser geral e obrigatório; pergunta comum pode ser de todos os setores ou de um setor',
  });

const perguntaSchema = withPerguntaRules(perguntaBaseSchema);
const createPerguntaSchema = withPerguntaRules(perguntaBaseSchema.extend({ ordem: z.number().int().positive().optional() }));

const perguntaWithOptions = async (client, perguntaId) => {
  const question = await client.query('SELECT * FROM pergunta WHERE id = $1', [perguntaId]);
  if (!question.rowCount) return null;
  const options = await client.query('SELECT id, pergunta_id, valor, rotulo, emoji FROM opcao_resposta WHERE pergunta_id = $1 ORDER BY valor', [perguntaId]);
  return { ...question.rows[0], opcoes: options.rows };
};

const canManagePerguntas = asyncHandler(async (req, _res, next) => {
  if (req.params?.id && !/^[1-9]\d*$/.test(req.params.id)) return next(new AppError('ID da pergunta inválido', 400, 'VALIDATION_ERROR'));
  const permissions = new Set(req.user?.permissoes ?? []);
  if (permissions.has('super_admin')) return next();
  if ((!permissions.has('admin_setor') && !permissions.has('gestao')) || !req.user?.setor_id) return next(new AppError('PermissÃ£o insuficiente', 403, 'FORBIDDEN'));
  let setorId = Number(req.body?.setor_id ?? 0) || null;
  const questionId = Number(req.params?.id ?? 0);
  if (questionId) {
    let existingQuestion;
    if (databaseConfigured) {
      const result = await query('SELECT setor_id, geral, todos_setores FROM pergunta WHERE id = $1', [questionId]);
      existingQuestion = result.rows[0];
    } else {
      existingQuestion = appStore.perguntas.find((item) => item.id === questionId);
    }
    if (existingQuestion?.geral || existingQuestion?.todos_setores) return next(new AppError('Perguntas compartilhadas só podem ser administradas pelo super administrador', 403, 'FORBIDDEN'));
    if (existingQuestion && existingQuestion.setor_id !== req.user.setor_id) return next(new AppError('PermissÃ£o insuficiente para este setor', 403, 'FORBIDDEN'));
    if (!setorId) setorId = existingQuestion?.setor_id ?? null;
  }
  if (req.body?.todos_setores || req.body?.geral) {
    return next(new AppError('Perguntas compartilhadas só podem ser administradas pelo super administrador', 403, 'FORBIDDEN'));
  }
  if (req.path.endsWith('/reordenar')) {
    const entries = req.body?.perguntas;
    if (!Array.isArray(entries) || !entries.every((item) => item && Number.isInteger(Number(item.id)) && Number(item.id) > 0)) return next();
    const ids = entries.map((item) => Number(item.id));
    const allowed = databaseConfigured
      ? (await query('SELECT id FROM pergunta WHERE id = ANY($1::int[]) AND setor_id = $2 AND geral = FALSE AND todos_setores = FALSE', [ids, req.user.setor_id])).rowCount === ids.length
      : ids.length > 0 && ids.every((id) => appStore.perguntas.some((item) => item.id === id && item.setor_id === req.user.setor_id && !item.geral && !item.todos_setores));
    if (!allowed) return next(new AppError('PermissÃ£o insuficiente para este setor', 403, 'FORBIDDEN'));
    return next();
  }
  if (setorId !== req.user.setor_id) return next(new AppError('PermissÃ£o insuficiente para este setor', 403, 'FORBIDDEN'));
  next();
});

const perguntaAccess = [requireAuth, requireAnyPermission('super_admin', 'gestao', 'admin_setor'), canManagePerguntas];

router.get('/admin/perguntas', requireAuth, requireAnyPermission('super_admin', 'gestao', 'admin_setor'), enforceUserSectorScope, asyncHandler(async (req, res) => {
  const scoped = !req.user.permissoes?.includes('super_admin')
    && (req.user.permissoes?.includes('gestao') || req.user.permissoes?.includes('admin_setor'));
  if (databaseConfigured) {
    const result = await query(`SELECT p.*, COALESCE(json_agg(json_build_object('id', o.id, 'pergunta_id', o.pergunta_id, 'valor', o.valor, 'rotulo', o.rotulo, 'emoji', o.emoji) ORDER BY o.valor) FILTER (WHERE o.id IS NOT NULL), '[]'::json) AS opcoes FROM pergunta p LEFT JOIN opcao_resposta o ON o.pergunta_id = p.id WHERE ($1::boolean = FALSE OR p.setor_id = $2 OR p.todos_setores = TRUE) GROUP BY p.id ORDER BY p.geral, p.todos_setores, p.setor_id, p.ordem`, [scoped, req.user.setor_id ?? null]);
    return res.json(result.rows);
  }
  res.json(appStore.perguntas.filter((p) => !scoped || p.setor_id === req.user.setor_id || p.todos_setores).map((p) => ({ ...p, opcoes: appStore.opcoesResposta.filter((o) => o.pergunta_id === p.id) })));
}));

router.post('/admin/perguntas', ...perguntaAccess, asyncHandler(async (req, res) => {
  const parsed = createPerguntaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: 'Dados inválidos', codigo: 'VALIDATION_ERROR', detalhes: parsed.error.flatten() });
  let p = parsed.data;
  if (p.tipo === 'rostinho' && (p.opcoes.length !== 5 || p.opcoes.some((o, i) => o.valor !== i + 1))) return res.status(400).json({ erro: 'Pergunta rostinho precisa de opções de 1 a 5', codigo: 'OPTIONS_INVALID' });
  if (p.tipo === 'nps' && p.opcoes.length && (p.opcoes.length !== 11 || p.opcoes.some((o, i) => o.valor !== i))) return res.status(400).json({ erro: 'Opções NPS devem cobrir 0 a 10', codigo: 'OPTIONS_INVALID' });
  if (databaseConfigured) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (!p.geral && !p.todos_setores && p.ativo) {
        const duplicateOrder = await client.query('SELECT 1 FROM pergunta WHERE setor_id = $1 AND ordem = $2 AND ativo = TRUE AND geral = FALSE AND todos_setores = FALSE', [p.setor_id, p.ordem]);
        if (duplicateOrder.rowCount) { await client.query('ROLLBACK'); return res.status(409).json({ erro: 'Ordem já está sendo usada neste setor', codigo: 'ORDER_CONFLICT' }); }
      }
      if (p.todos_setores && p.ativo) {
        const duplicateOrder = await client.query('SELECT 1 FROM pergunta WHERE todos_setores = TRUE AND geral = FALSE AND ordem = $1 AND ativo = TRUE', [p.ordem]);
        if (duplicateOrder.rowCount) { await client.query('ROLLBACK'); return res.status(409).json({ erro: 'Ordem já está sendo usada por uma pergunta compartilhada', codigo: 'ORDER_CONFLICT' }); }
      }
      if (p.geral) {
        const existing = await client.query('SELECT 1 FROM pergunta WHERE geral = TRUE AND ativo = TRUE FOR UPDATE');
        if (existing.rowCount) { await client.query('ROLLBACK'); return res.status(409).json({ erro: 'Já existe uma pergunta NPS geral ativa', codigo: 'NPS_EXISTS' }); }
      }
      const inserted = await client.query(`INSERT INTO pergunta (hospital_id, setor_id, texto, tipo, geral, todos_setores, ordem, obrigatoria, ativo) VALUES (COALESCE((SELECT hospital_id FROM setor WHERE id = $1), (SELECT id FROM hospital ORDER BY id LIMIT 1), 1), $1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`, [p.setor_id ?? null, p.texto, p.tipo, p.geral, p.todos_setores, p.ordem, p.obrigatoria, p.ativo]);
      for (const option of p.opcoes) await client.query('INSERT INTO opcao_resposta (pergunta_id, valor, rotulo, emoji) VALUES ($1, $2, $3, $4)', [inserted.rows[0].id, option.valor, option.rotulo, option.emoji ?? null]);
      const body = await perguntaWithOptions(client, inserted.rows[0].id);
      await client.query('COMMIT');
      return res.status(201).json(body);
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  if (p.ordem === undefined && !p.geral) {
    const nextOrder = Math.max(0, ...appStore.perguntas.filter((q) => q.ativo && !q.geral && q.setor_id === p.setor_id).map((q) => q.ordem)) + 1;
    p = { ...p, ordem: nextOrder };
  }
  if (p.ordem === undefined) p = { ...p, ordem: 1 };
  if (p.geral && appStore.perguntas.some((q) => q.geral && q.ativo)) return res.status(409).json({ erro: 'Já existe uma pergunta NPS geral ativa', codigo: 'NPS_EXISTS' });
  if (!p.geral && !p.todos_setores && p.ativo && appStore.perguntas.some((q) => q.ativo && !q.geral && !q.todos_setores && q.setor_id === p.setor_id && q.ordem === p.ordem)) return res.status(409).json({ erro: 'Ordem já está sendo usada neste setor', codigo: 'ORDER_CONFLICT' });
  if (p.todos_setores && p.ativo && appStore.perguntas.some((q) => q.ativo && q.todos_setores && !q.geral && q.ordem === p.ordem)) return res.status(409).json({ erro: 'Ordem já está sendo usada por uma pergunta compartilhada', codigo: 'ORDER_CONFLICT' });
  const { opcoes, ...questionData } = p;
  const item = { id: Math.max(0, ...appStore.perguntas.map((q) => q.id)) + 1, hospital_id: 1, ...questionData };
  appStore.perguntas.push(item);
  for (const option of opcoes) appStore.opcoesResposta.push({ ...option, id: Math.max(0, ...appStore.opcoesResposta.map((x) => x.id)) + 1, pergunta_id: item.id });
  return res.status(201).json({ ...item, opcoes: appStore.opcoesResposta.filter((o) => o.pergunta_id === item.id) });
}));

router.put('/admin/perguntas/:id', ...perguntaAccess, asyncHandler(async (req, res) => {
  const parsed = perguntaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: 'Dados inválidos', codigo: 'VALIDATION_ERROR', detalhes: parsed.error.flatten() });
  const p = parsed.data; const id = Number(req.params.id);
  if (databaseConfigured) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (!p.geral && !p.todos_setores && p.ativo) {
        const duplicateOrder = await client.query('SELECT 1 FROM pergunta WHERE setor_id = $1 AND ordem = $2 AND ativo = TRUE AND geral = FALSE AND todos_setores = FALSE AND id <> $3', [p.setor_id, p.ordem, id]);
        if (duplicateOrder.rowCount) { await client.query('ROLLBACK'); return res.status(409).json({ erro: 'Ordem já está sendo usada neste setor', codigo: 'ORDER_CONFLICT' }); }
      }
      if (p.todos_setores && p.ativo) {
        const duplicateOrder = await client.query('SELECT 1 FROM pergunta WHERE todos_setores = TRUE AND geral = FALSE AND ordem = $1 AND ativo = TRUE AND id <> $2', [p.ordem, id]);
        if (duplicateOrder.rowCount) { await client.query('ROLLBACK'); return res.status(409).json({ erro: 'Ordem já está sendo usada por uma pergunta compartilhada', codigo: 'ORDER_CONFLICT' }); }
      }
      if (p.geral && p.ativo) { const exists = await client.query('SELECT 1 FROM pergunta WHERE geral = TRUE AND ativo = TRUE AND id <> $1 FOR UPDATE', [id]); if (exists.rowCount) { await client.query('ROLLBACK'); return res.status(409).json({ erro: 'Já existe uma pergunta NPS geral ativa', codigo: 'NPS_EXISTS' }); } }
      const updated = await client.query('UPDATE pergunta SET setor_id=$2, texto=$3, tipo=$4, geral=$5, todos_setores=$6, ordem=$7, obrigatoria=$8, ativo=$9 WHERE id=$1 RETURNING id', [id, p.setor_id ?? null, p.texto, p.tipo, p.geral, p.todos_setores, p.ordem, p.obrigatoria, p.ativo]);
      if (!updated.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ erro: 'Pergunta não encontrada', codigo: 'PERGUNTA_NOT_FOUND' }); }
      await client.query('DELETE FROM opcao_resposta WHERE pergunta_id=$1', [id]);
      for (const o of p.opcoes) await client.query('INSERT INTO opcao_resposta (pergunta_id,valor,rotulo,emoji) VALUES ($1,$2,$3,$4)', [id,o.valor,o.rotulo,o.emoji ?? null]);
      const body = await perguntaWithOptions(client, id); await client.query('COMMIT'); return res.json(body);
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  const item = appStore.perguntas.find((q) => q.id === id); if (!item) return res.status(404).json({ erro: 'Pergunta não encontrada', codigo: 'PERGUNTA_NOT_FOUND' });
  if (!p.geral && !p.todos_setores && p.ativo && appStore.perguntas.some((q) => q.id !== id && q.ativo && !q.geral && !q.todos_setores && q.setor_id === p.setor_id && q.ordem === p.ordem)) return res.status(409).json({ erro: 'Ordem já está sendo usada neste setor', codigo: 'ORDER_CONFLICT' });
  if (p.todos_setores && p.ativo && appStore.perguntas.some((q) => q.id !== id && q.ativo && q.todos_setores && !q.geral && q.ordem === p.ordem)) return res.status(409).json({ erro: 'Ordem já está sendo usada por uma pergunta compartilhada', codigo: 'ORDER_CONFLICT' });
  if (p.geral && p.ativo && appStore.perguntas.some((q) => q.id !== id && q.geral && q.ativo)) return res.status(409).json({ erro: 'Já existe uma pergunta NPS geral ativa', codigo: 'NPS_EXISTS' });
  const { opcoes, ...questionData } = p;
  Object.assign(item, questionData); appStore.opcoesResposta = appStore.opcoesResposta.filter((o) => o.pergunta_id !== id);
  for (const option of opcoes) appStore.opcoesResposta.push({ ...option, id: Math.max(0, ...appStore.opcoesResposta.map((x) => x.id)) + 1, pergunta_id: id });
  return res.json({ ...item, opcoes: appStore.opcoesResposta.filter((o) => o.pergunta_id === id) });
}));

router.delete('/admin/perguntas/:id', ...perguntaAccess, asyncHandler(async (req, res) => {
  if (databaseConfigured) { const result = await query('UPDATE pergunta SET ativo=FALSE WHERE id=$1 RETURNING *', [Number(req.params.id)]); if (!result.rowCount) return res.status(404).json({ erro: 'Pergunta não encontrada', codigo: 'PERGUNTA_NOT_FOUND' }); return res.json(result.rows[0]); }
  const item = appStore.perguntas.find((q) => q.id === Number(req.params.id)); if (!item) return res.status(404).json({ erro: 'Pergunta não encontrada', codigo: 'PERGUNTA_NOT_FOUND' }); item.ativo = false; return res.json(item);
}));

router.patch('/admin/perguntas/reordenar', ...perguntaAccess, asyncHandler(async (req, res) => {
  const parsed = z.object({ perguntas: z.array(z.object({ id: z.number().int().positive(), ordem: z.number().int().positive() })).min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: 'Dados inválidos', codigo: 'VALIDATION_ERROR', detalhes: parsed.error.flatten() });
  const items = parsed.data.perguntas;
  if (new Set(items.map((x) => x.id)).size !== items.length || new Set(items.map((x) => x.ordem)).size !== items.length) return res.status(400).json({ erro: 'IDs e ordens não podem se repetir', codigo: 'ORDER_INVALID' });
  if (databaseConfigured) { const client = await pool.connect(); try {
    await client.query('BEGIN');
    for (const item of items) {
      const exists = await client.query('SELECT 1 FROM pergunta WHERE id=$1 AND geral=FALSE AND todos_setores=FALSE AND ativo=TRUE', [item.id]);
      if (!exists.rowCount) { await client.query('ROLLBACK'); return res.status(400).json({ erro: `Pergunta ${item.id} inválida`, codigo: 'ORDER_INVALID' }); }
      const conflict = await client.query('SELECT 1 FROM pergunta WHERE setor_id=(SELECT setor_id FROM pergunta WHERE id=$1) AND ordem=$2 AND ativo=TRUE AND geral=FALSE AND todos_setores=FALSE AND NOT (id=ANY($3::int[]))', [item.id, item.ordem, items.map((entry) => entry.id)]);
      if (conflict.rowCount) { await client.query('ROLLBACK'); return res.status(409).json({ erro: 'Ordem já está sendo usada por uma pergunta fora da lista', codigo: 'ORDER_CONFLICT' }); }
    }
    const ids = items.map((item) => item.id);
    await client.query('UPDATE pergunta SET ordem = -id WHERE id = ANY($1::int[])', [ids]);
    for (const item of items) await client.query('UPDATE pergunta SET ordem=$2 WHERE id=$1', [item.id,item.ordem]);
    await client.query('COMMIT'); return res.json({ ok: true });
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); } }
  const selectedIds = new Set(items.map((item) => item.id));
  for (const item of items) {
    const question = appStore.perguntas.find((q) => q.id === item.id && q.ativo && !q.geral && !q.todos_setores);
    if (!question) return res.status(400).json({ erro: `Pergunta ${item.id} inválida`, codigo: 'ORDER_INVALID' });
    if (appStore.perguntas.some((q) => q.ativo && !q.geral && !q.todos_setores && q.setor_id === question.setor_id && q.ordem === item.ordem && !selectedIds.has(q.id))) return res.status(409).json({ erro: 'Ordem já está sendo usada por uma pergunta fora da lista', codigo: 'ORDER_CONFLICT' });
  }
  for (const item of items) appStore.perguntas.find((q) => q.id === item.id).ordem = -item.id;
  for (const item of items) appStore.perguntas.find((q) => q.id === item.id).ordem = item.ordem;
  return res.json({ ok: true });
}));

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

  const slug = normalizeSetorSlug(payload.data.slug ?? payload.data.nome);
  if (slug.length < 2) return res.status(400).json({ erro: 'Nome ou slug inválido', codigo: 'VALIDATION_ERROR' });
  if (!databaseConfigured && appStore.setores.some((item) => item.slug === slug)) return res.status(409).json({ erro: 'Já existe um setor com este slug', codigo: 'SETOR_SLUG_CONFLICT' });
  if (databaseConfigured) {
    try {
      const result = await query(
        `INSERT INTO setor (hospital_id, nome, slug, url, qrcode, ativo)
         VALUES (1, $1, $2, $3, $4, $5)
         RETURNING *`,
        [payload.data.nome, slug, `/${slug}`, `qr-${slug}`, payload.data.ativo],
      );
      return res.status(201).json(result.rows[0]);
    } catch (error) {
      if (error.code === '23505') return res.status(409).json({ erro: 'Já existe um setor com este slug', codigo: 'SETOR_SLUG_CONFLICT' });
      throw error;
    }
  }

  const setor = {
    id: appStore.setores.length + 1,
    hospital_id: 1,
    nome: payload.data.nome,
    slug,
    url: `/${slug}`,
    qrcode: `qr-${slug}`,
    ativo: payload.data.ativo,
  };

  appStore.setores.push(setor);
  return res.status(201).json(setor);
}));

router.patch('/admin/setores/:id', requireAuth, requirePermission('super_admin'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ erro: 'ID do setor inválido', codigo: 'VALIDATION_ERROR' });
  const payload = setorPatchSchema.safeParse(req.body);
  if (!payload.success) return res.status(400).json({ erro: 'Dados inválidos', codigo: 'VALIDATION_ERROR', detalhes: payload.error.flatten() });

  const changes = payload.data;
  const slug = changes.slug === undefined ? undefined : normalizeSetorSlug(changes.slug);
  if (slug !== undefined && slug.length < 2) return res.status(400).json({ erro: 'Slug inválido', codigo: 'VALIDATION_ERROR' });

  if (databaseConfigured) {
    try {
      const result = await query(
        `UPDATE setor
         SET nome = COALESCE($2, nome),
             slug = COALESCE($3, slug),
             url = CASE WHEN $3::text IS NULL THEN url ELSE '/' || $3 END,
             qrcode = CASE WHEN $3::text IS NULL THEN qrcode ELSE 'qr-' || $3 END,
             ativo = COALESCE($4, ativo)
         WHERE id = $1
         RETURNING *`,
        [id, changes.nome ?? null, slug ?? null, changes.ativo ?? null],
      );
      if (!result.rowCount) return res.status(404).json({ erro: 'Setor não encontrado', codigo: 'SETOR_NOT_FOUND' });
      return res.json(result.rows[0]);
    } catch (error) {
      if (error.code === '23505') return res.status(409).json({ erro: 'Já existe um setor com este slug', codigo: 'SETOR_SLUG_CONFLICT' });
      throw error;
    }
  }

  const setor = appStore.setores.find((item) => item.id === id);
  if (!setor) return res.status(404).json({ erro: 'Setor não encontrado', codigo: 'SETOR_NOT_FOUND' });
  if (slug !== undefined && appStore.setores.some((item) => item.id !== id && item.slug === slug)) return res.status(409).json({ erro: 'Já existe um setor com este slug', codigo: 'SETOR_SLUG_CONFLICT' });
  if (changes.nome !== undefined) setor.nome = changes.nome;
  if (slug !== undefined) {
    setor.slug = slug;
    setor.url = `/${slug}`;
    setor.qrcode = `qr-${slug}`;
  }
  if (changes.ativo !== undefined) setor.ativo = changes.ativo;
  return res.json(setor);
}));

router.delete('/admin/setores/:id', requireAuth, requirePermission('super_admin'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ erro: 'ID do setor inválido', codigo: 'VALIDATION_ERROR' });
  if (databaseConfigured) {
    const result = await query('UPDATE setor SET ativo = FALSE WHERE id = $1 RETURNING *', [id]);
    if (!result.rowCount) return res.status(404).json({ erro: 'Setor não encontrado', codigo: 'SETOR_NOT_FOUND' });
    return res.json(result.rows[0]);
  }
  const setor = appStore.setores.find((item) => item.id === id);
  if (!setor) return res.status(404).json({ erro: 'Setor não encontrado', codigo: 'SETOR_NOT_FOUND' });
  setor.ativo = false;
  return res.json(setor);
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
