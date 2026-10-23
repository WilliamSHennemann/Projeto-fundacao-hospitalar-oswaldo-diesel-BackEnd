import { Router } from 'express';
import { appStore } from '../../shared/store.js';
import { calculateAverage, calculateNps } from '../../shared/metrics.js';
import { requireAuth } from '../auth/auth.routes.js';
import { asyncHandler, databaseConfigured, query } from '../../config/database.js';

const router = Router();

router.get('/dashboard/resumo', requireAuth, asyncHandler(async (_req, res) => {
  if (databaseConfigured) {
    const result = await query(
      `SELECT COUNT(*)::integer AS total,
              COUNT(*) FILTER (WHERE status = 'parcial')::integer AS parciais,
              AVG(media_parcial) AS media,
              ARRAY_AGG(nps_nota) FILTER (WHERE nps_nota IS NOT NULL) AS notas
       FROM pesquisa`,
    );
    const row = result.rows[0];
    return res.json({
      nps_geral: calculateNps((row.notas ?? []).map(Number)),
      media_geral: row.media === null ? null : Number(Number(row.media).toFixed(1)),
      total_pesquisas: row.total,
      percentual_parciais: row.total ? (row.parciais / row.total) * 100 : 0,
      periodo: 'all',
    });
  }

  const notas = appStore.pesquisas.filter((item) => item.nps_nota !== null).map((item) => item.nps_nota);
  const totalParciais = appStore.pesquisas.filter((item) => item.status === 'parcial').length;
  res.json({
    nps_geral: calculateNps(notas),
    media_geral: calculateAverage(appStore.pesquisas.filter((item) => item.media_parcial !== null).map((item) => item.media_parcial ?? 0)),
    total_pesquisas: appStore.pesquisas.length,
    percentual_parciais: appStore.pesquisas.length ? (totalParciais / appStore.pesquisas.length) * 100 : 0,
    periodo: 'all',
  });
}));

router.get('/dashboard/setores', requireAuth, asyncHandler(async (_req, res) => {
  if (databaseConfigured) {
    const result = await query(
      `SELECT s.id AS setor_id, s.nome,
              ARRAY_AGG(p.nps_nota) FILTER (WHERE p.nps_nota IS NOT NULL) AS notas,
              AVG(p.media_parcial) FILTER (WHERE p.nps_nota IS NOT NULL) AS media
       FROM setor s
       LEFT JOIN pesquisa p ON p.setor_id = s.id
       WHERE s.ativo = TRUE
       GROUP BY s.id
       ORDER BY s.id`,
    );
    return res.json(result.rows.map((row) => ({
      setor_id: row.setor_id,
      nome: row.nome,
      nps: calculateNps((row.notas ?? []).map(Number)),
      media: row.media === null ? null : Number(Number(row.media).toFixed(1)),
    })));
  }

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
}));

router.get('/dashboard/setores/:id/turnos', requireAuth, asyncHandler(async (req, res) => {
  const setorId = Number(req.params.id);
  const turnos = ['manha', 'tarde', 'noite'];

  if (databaseConfigured) {
    const result = await query(
      `SELECT turno, COUNT(*) FILTER (WHERE nps_nota IS NOT NULL)::integer AS total,
              ARRAY_AGG(nps_nota) FILTER (WHERE nps_nota IS NOT NULL) AS notas,
              AVG(media_parcial) FILTER (WHERE nps_nota IS NOT NULL) AS media
       FROM pesquisa WHERE setor_id = $1 GROUP BY turno`,
      [setorId],
    );
    const byTurn = new Map(result.rows.map((row) => [row.turno, row]));
    return res.json(turnos.map((turno) => {
      const row = byTurn.get(turno);
      return {
        turno,
        total: row?.total ?? 0,
        nps: calculateNps((row?.notas ?? []).map(Number)),
        media: row?.media === null || row?.media === undefined
          ? null
          : Number(Number(row.media).toFixed(1)),
      };
    }));
  }

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
}));

router.get('/dashboard/equipes', requireAuth, (_req, res) => {
  res.json({
    melhores: [],
    piores: [],
    resumo: 'Criação da equipe vinculada por setor, data e turno no módulo administrativo',
  });
});

router.get('/dashboard/em-andamento', requireAuth, asyncHandler(async (_req, res) => {
  if (databaseConfigured) {
    const result = await query(
      `SELECT id, setor_id, media_parcial, ultima_atividade, status
       FROM pesquisa WHERE status = 'em_andamento' ORDER BY ultima_atividade DESC`,
    );
    return res.json(result.rows);
  }
  const pesquisas = appStore.pesquisas.filter((item) => item.status === 'em_andamento');
  res.json(pesquisas.map((pesquisa) => ({
    id: pesquisa.id,
    setor_id: pesquisa.setor_id,
    media_parcial: pesquisa.media_parcial,
    ultima_atividade: pesquisa.ultima_atividade,
    status: pesquisa.status,
  })));
}));

export default router;
