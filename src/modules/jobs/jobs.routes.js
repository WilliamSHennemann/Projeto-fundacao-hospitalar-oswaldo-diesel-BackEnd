import { Router } from 'express';
import { appStore } from '../../shared/store.js';
import { requireAuth, requirePermission } from '../auth/auth.routes.js';
import { asyncHandler, databaseConfigured, query } from '../../config/database.js';

const router = Router();

const getConfigNumber = (key, fallback) => {
  const value = appStore.configuracoes.find((item) => item.chave === key)?.valor?.valor;
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
};

router.get('/jobs/abandono', requireAuth, requirePermission('gestao'), asyncHandler(async (_req, res) => {
  if (databaseConfigured) {
    const [setting, count] = await Promise.all([
      query(
        `SELECT c.valor->>'valor' AS valor
         FROM configuracao c JOIN setor s ON s.hospital_id = c.hospital_id
         WHERE s.id = (SELECT id FROM setor ORDER BY id LIMIT 1)
           AND c.chave = 'minutos_abandono' LIMIT 1`,
      ),
      query(
        `SELECT COUNT(*)::integer AS total FROM pesquisa
         WHERE status = 'em_andamento'
           AND ultima_atividade <= NOW() - (
             COALESCE((
               SELECT (c.valor->>'valor')::integer
               FROM configuracao c
               JOIN setor s ON s.hospital_id = c.hospital_id
               WHERE s.id = (SELECT id FROM setor ORDER BY id LIMIT 1)
                 AND c.chave = 'minutos_abandono'
               LIMIT 1
             ), 30) * INTERVAL '1 minute'
           )`,
      ),
    ]);
    const limiteMinutos = Number(setting.rows[0]?.valor ?? 30);
    return res.json({
      total: count.rows[0].total,
      limite_minutos: limiteMinutos,
      status: 'ok',
      monitorado: true,
      analisado_em: new Date().toISOString(),
    });
  }

  const limiteMinutos = getConfigNumber('minutos_abandono', 30);
  const agora = Date.now();
  const total = appStore.pesquisas.filter((pesquisa) => {
    if (pesquisa.status !== 'em_andamento') {
      return false;
    }

    const ultimaAtividade = new Date(pesquisa.ultima_atividade ?? pesquisa.data_hora ?? Date.now()).getTime();
    const tempoEmAberto = (agora - ultimaAtividade) / 60000;
    return tempoEmAberto >= limiteMinutos;
  }).length;

  res.json({
    total,
    limite_minutos: limiteMinutos,
    status: 'ok',
    monitorado: true,
    analisado_em: new Date().toISOString(),
  });
}));

router.get('/jobs/retencao', requireAuth, requirePermission('gestao'), asyncHandler(async (_req, res) => {
  if (databaseConfigured) {
    const [setting, result] = await Promise.all([
      query(
        `SELECT c.valor->>'valor' AS valor
         FROM configuracao c JOIN setor s ON s.hospital_id = c.hospital_id
         WHERE s.id = (SELECT id FROM setor ORDER BY id LIMIT 1)
           AND c.chave = 'retencao_dias' LIMIT 1`,
      ),
      query(
        `SELECT COUNT(*)::integer AS total,
                COUNT(*) FILTER (WHERE status = 'concluida')::integer AS concluidas
         FROM pesquisa`,
      ),
    ]);
    const diasAlvo = Number(setting.rows[0]?.valor ?? 365);
    const totalPesquisas = result.rows[0].total;
    const concluidas = result.rows[0].concluidas;
    const taxaRetencao = totalPesquisas ? Number(((concluidas / totalPesquisas) * 100).toFixed(2)) : 0;
    return res.json({
      taxa_retencao: taxaRetencao,
      dias_alvo: diasAlvo,
      total_pesquisas: totalPesquisas,
      pesquisas_concluidas: concluidas,
      status: 'ok',
      sugerida_acao: taxaRetencao < 50 ? 'disparo_de_followup' : 'manter_monitoramento',
    });
  }

  const diasAlvo = getConfigNumber('retencao_dias', 365);
  const totalPesquisas = appStore.pesquisas.length;
  const concluidas = appStore.pesquisas.filter((pesquisa) => pesquisa.status === 'concluida').length;
  const taxaRetencao = totalPesquisas > 0 ? Number(((concluidas / totalPesquisas) * 100).toFixed(2)) : 0;

  res.json({
    taxa_retencao: taxaRetencao,
    dias_alvo: diasAlvo,
    total_pesquisas: totalPesquisas,
    pesquisas_concluidas: concluidas,
    status: 'ok',
    sugerida_acao: taxaRetencao < 50 ? 'disparo_de_followup' : 'manter_monitoramento',
  });
}));

export default router;
