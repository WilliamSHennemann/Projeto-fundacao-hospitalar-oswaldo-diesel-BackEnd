import { Router } from 'express';
import { appStore } from '../../shared/store.js';
import { calculateAverage, calculateNps } from '../../shared/metrics.js';

const router = Router();

router.get('/tvwall', (_req, res) => {
  const notas = appStore.pesquisas.filter((item) => item.nps_nota !== null).map((item) => item.nps_nota);
  const medias = appStore.pesquisas.filter((item) => item.media_parcial !== null).map((item) => item.media_parcial);

  res.json({
    nps_geral: calculateNps(notas),
    media_geral: calculateAverage(medias),
    setores: appStore.setores.filter((setor) => setor.ativo).map((setor) => ({
      nome: setor.nome,
      slug: setor.slug,
      nps: calculateNps(appStore.pesquisas.filter((item) => item.setor_id === setor.id && item.nps_nota !== null).map((item) => item.nps_nota)),
    })),
    elogios_gerais: appStore.manifestacoes.filter((item) => item.tipo === 'elogio').length,
    cache_seconds: 30,
  });
});

export default router;
