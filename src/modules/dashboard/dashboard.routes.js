import { Router } from 'express';
import { appStore } from '../../shared/store.js';
import { calculateAverage, calculateNps } from '../../shared/metrics.js';
import { requireAuth } from '../auth/auth.routes.js';

const router = Router();

router.get('/dashboard/resumo', requireAuth, (_req, res) => {
  const notas = appStore.pesquisas.filter((item) => item.nps_nota !== null).map((item) => item.nps_nota);
  const totalParciais = appStore.pesquisas.filter((item) => item.status === 'parcial').length;

  res.json({
    nps_geral: calculateNps(notas),
    media_geral: calculateAverage(appStore.pesquisas.filter((item) => item.media_parcial !== null).map((item) => item.media_parcial ?? 0)),
    total_pesquisas: appStore.pesquisas.length,
    percentual_parciais: appStore.pesquisas.length ? (totalParciais / appStore.pesquisas.length) * 100 : 0,
    periodo: 'all',
  });
});

router.get('/dashboard/setores', requireAuth, (_req, res) => {
  const setores = appStore.setores.filter((setor) => setor.ativo).map((setor) => {
    const pesquisas = appStore.pesquisas.filter((item) => item.setor_id === setor.id && item.nps_nota !== null);
    return {
      setor_id: setor.id,
      nome: setor.nome,
      nps: calculateNps(pesquisas.map((item) => item.nps_nota)),
      media: calculateAverage(pesquisas.map((item) => item.media_parcial ?? 0)),
    };
  });

  res.json(setores);
});

router.get('/dashboard/setores/:id/turnos', requireAuth, (req, res) => {
  const setorId = Number(req.params.id);
  const turnos = ['manha', 'tarde', 'noite'];

  const payload = turnos.map((turno) => {
    const pesquisas = appStore.pesquisas.filter((item) => item.setor_id === setorId && item.turno === turno && item.nps_nota !== null);
    return {
      turno,
      total: pesquisas.length,
      nps: calculateNps(pesquisas.map((item) => item.nps_nota)),
      media: calculateAverage(pesquisas.map((item) => item.media_parcial ?? 0)),
    };
  });

  res.json(payload);
});

router.get('/dashboard/equipes', requireAuth, (_req, res) => {
  res.json({
    melhores: [],
    piores: [],
    resumo: 'Criação da equipe vinculada por setor, data e turno no módulo administrativo',
  });
});

router.get('/dashboard/em-andamento', requireAuth, (_req, res) => {
  const pesquisas = appStore.pesquisas.filter((item) => item.status === 'em_andamento');
  res.json(pesquisas.map((pesquisa) => ({
    id: pesquisa.id,
    setor_id: pesquisa.setor_id,
    media_parcial: pesquisa.media_parcial,
    ultima_atividade: pesquisa.ultima_atividade,
    status: pesquisa.status,
  })));
});

export default router;
