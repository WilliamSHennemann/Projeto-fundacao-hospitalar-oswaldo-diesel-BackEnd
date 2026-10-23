import { Router } from 'express';
import { z } from 'zod';
import { appStore } from '../../shared/store.js';
import { requireAuth } from '../auth/auth.routes.js';
import { asyncHandler, databaseConfigured, query } from '../../config/database.js';

const router = Router();

router.get('/manifestacoes', requireAuth, asyncHandler(async (_req, res) => {
  if (databaseConfigured) {
    const result = await query('SELECT * FROM manifestacao ORDER BY data DESC, id DESC');
    return res.json(result.rows);
  }
  res.json(appStore.manifestacoes);
}));

router.get('/manifestacoes/:id', requireAuth, asyncHandler(async (req, res) => {
  if (databaseConfigured) {
    const result = await query('SELECT * FROM manifestacao WHERE id = $1', [Number(req.params.id)]);
    const manifestacaoDb = result.rows[0];
    if (!manifestacaoDb) {
      return res.status(404).json({ erro: 'Manifestação não encontrada', codigo: 'MANIFESTACAO_NOT_FOUND' });
    }
    const [survey, answers] = await Promise.all([
      query('SELECT * FROM pesquisa WHERE id = $1', [manifestacaoDb.pesquisa_id]),
      query('SELECT * FROM resposta WHERE pesquisa_id = $1 ORDER BY id', [manifestacaoDb.pesquisa_id]),
    ]);
    return res.json({ ...manifestacaoDb, pesquisa: survey.rows[0], respostas: answers.rows });
  }
  const manifestacao = appStore.manifestacoes.find((item) => item.id === Number(req.params.id));
  if (!manifestacao) {
    return res.status(404).json({ erro: 'Manifestação não encontrada', codigo: 'MANIFESTACAO_NOT_FOUND' });
  }

  return res.json({
    ...manifestacao,
    pesquisa: appStore.pesquisas.find((item) => item.id === manifestacao.pesquisa_id),
    respostas: appStore.respostas.filter((item) => item.pesquisa_id === manifestacao.pesquisa_id),
  });
}));

router.patch('/manifestacoes/:id', requireAuth, asyncHandler(async (req, res) => {
  const schema = z.object({
    status: z.enum(['aberta', 'em_tratamento', 'concluida']).optional(),
    parecer_interno: z.string().optional(),
  });

  const payload = schema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ erro: 'Dados inválidos', codigo: 'VALIDATION_ERROR', detalhes: payload.error.flatten() });
  }

  if (databaseConfigured) {
    const result = await query(
      `UPDATE manifestacao
       SET status = COALESCE($2, status),
           parecer_interno = COALESCE($3, parecer_interno)
       WHERE id = $1
       RETURNING *`,
      [Number(req.params.id), payload.data.status ?? null, payload.data.parecer_interno ?? null],
    );
    if (!result.rowCount) {
      return res.status(404).json({ erro: 'Manifestação não encontrada', codigo: 'MANIFESTACAO_NOT_FOUND' });
    }
    return res.json(result.rows[0]);
  }

  const manifestacao = appStore.manifestacoes.find((item) => item.id === Number(req.params.id));
  if (!manifestacao) {
    return res.status(404).json({ erro: 'Manifestação não encontrada', codigo: 'MANIFESTACAO_NOT_FOUND' });
  }
  Object.assign(manifestacao, payload.data);
  return res.json(manifestacao);
}));

export default router;
