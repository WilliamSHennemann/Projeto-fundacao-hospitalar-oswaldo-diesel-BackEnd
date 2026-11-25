import { Router } from 'express';
import { appStore } from '../../shared/store.js';
import { calculateAverage, calculateNps } from '../../shared/metrics.js';
import { asyncHandler, databaseConfigured, query } from '../../config/database.js';
import { enforceUserSectorScope, requireAuth } from '../auth/auth.routes.js';

const router = Router();

router.get('/tvwall', requireAuth, enforceUserSectorScope(), asyncHandler(async (req, res) => {
  const setorId = req.query.setor_id ? Number(req.query.setor_id) : null;
  if (databaseConfigured) {
    const [surveys, sectors, compliments] = await Promise.all([
      query(
        `SELECT ARRAY_AGG(nps_nota) FILTER (WHERE nps_nota IS NOT NULL) AS notas,
                ARRAY_AGG(media_parcial) FILTER (WHERE media_parcial IS NOT NULL) AS medias
         FROM pesquisa
         WHERE ($1::integer IS NULL OR setor_id = $1)`,
        [setorId],
      ),
      query(
        `SELECT s.nome, s.slug,
                ARRAY_AGG(p.nps_nota) FILTER (WHERE p.nps_nota IS NOT NULL) AS notas
         FROM setor s LEFT JOIN pesquisa p ON p.setor_id = s.id
         WHERE s.ativo = TRUE AND ($1::integer IS NULL OR s.id = $1)
         GROUP BY s.id ORDER BY s.id`,
        [setorId],
      ),
      query(
        `SELECT COUNT(*)::integer AS total
         FROM manifestacao m JOIN pesquisa p ON p.id = m.pesquisa_id
         WHERE m.tipo = 'elogio' AND ($1::integer IS NULL OR p.setor_id = $1)`,
        [setorId],
      ),
    ]);
    const row = surveys.rows[0];
    return res.json({
      nps_geral: calculateNps((row.notas ?? []).map(Number)),
      media_geral: calculateAverage((row.medias ?? []).map(Number)),
      setores: sectors.rows.map((sector) => ({
        nome: sector.nome,
        slug: sector.slug,
        nps: calculateNps((sector.notas ?? []).map(Number)),
      })),
      elogios_gerais: compliments.rows[0].total,
      cache_seconds: 30,
    });
  }

  const pesquisas = appStore.pesquisas.filter((item) => !setorId || item.setor_id === setorId);
  const notas = pesquisas.filter((item) => item.nps_nota !== null).map((item) => item.nps_nota);
  const medias = pesquisas.filter((item) => item.media_parcial !== null).map((item) => item.media_parcial);

  res.json({
    nps_geral: calculateNps(notas),
    media_geral: calculateAverage(medias),
    setores: appStore.setores.filter((setor) => setor.ativo && (!setorId || setor.id === setorId)).map((setor) => ({
      nome: setor.nome,
      slug: setor.slug,
      nps: calculateNps(pesquisas.filter((item) => item.setor_id === setor.id && item.nps_nota !== null).map((item) => item.nps_nota)),
    })),
    elogios_gerais: appStore.manifestacoes.filter((item) => item.tipo === 'elogio'
      && pesquisas.some((pesquisa) => pesquisa.id === item.pesquisa_id)).length,
    cache_seconds: 30,
  });
}));

export default router;
