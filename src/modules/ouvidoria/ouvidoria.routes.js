import { Router } from 'express';
import { z } from 'zod';
import { appStore } from '../../shared/store.js';
import { requireAuth } from '../auth/auth.routes.js';

const router = Router();

router.get('/manifestacoes', requireAuth, (_req, res) => {
  res.json(appStore.manifestacoes);
});

router.get('/manifestacoes/:id', requireAuth, (req, res) => {
  const manifestacao = appStore.manifestacoes.find((item) => item.id === Number(req.params.id));
  if (!manifestacao) {
    return res.status(404).json({ erro: 'Manifestação não encontrada', codigo: 'MANIFESTACAO_NOT_FOUND' });
  }

  return res.json({
    ...manifestacao,
    pesquisa: appStore.pesquisas.find((item) => item.id === manifestacao.pesquisa_id),
    respostas: appStore.respostas.filter((item) => item.pesquisa_id === manifestacao.pesquisa_id),
  });
});

router.patch('/manifestacoes/:id', requireAuth, (req, res) => {
  const manifestacao = appStore.manifestacoes.find((item) => item.id === Number(req.params.id));
  if (!manifestacao) {
    return res.status(404).json({ erro: 'Manifestação não encontrada', codigo: 'MANIFESTACAO_NOT_FOUND' });
  }

  const schema = z.object({
    status: z.enum(['aberta', 'em_tratamento', 'concluida']).optional(),
    parecer_interno: z.string().optional(),
  });

  const payload = schema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ erro: 'Dados inválidos', codigo: 'VALIDATION_ERROR', detalhes: payload.error.flatten() });
  }

  Object.assign(manifestacao, payload.data);
  return res.json(manifestacao);
});

export default router;
