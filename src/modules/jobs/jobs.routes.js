import { Router } from 'express';
import { appStore } from '../../shared/store.js';
import { requireAuth, requirePermission } from '../auth/auth.routes.js';

const router = Router();

const getConfigNumber = (key, fallback) => {
  const value = appStore.configuracoes.find((item) => item.chave === key)?.valor?.valor;
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
};

router.get('/jobs/abandono', requireAuth, requirePermission('gestao'), (_req, res) => {
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
});

router.get('/jobs/retencao', requireAuth, requirePermission('gestao'), (_req, res) => {
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
});

export default router;
