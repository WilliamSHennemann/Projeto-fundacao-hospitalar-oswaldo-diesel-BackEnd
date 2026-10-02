import { Router } from 'express';
import { appStore } from '../../shared/store.js';
import { requireAuth } from '../auth/auth.routes.js';

const router = Router();

router.get('/exportacoes/excel', requireAuth, (_req, res) => {
  appStore.exportacoes.push({ id: appStore.exportacoes.length + 1, usuario_id: 1, tipo: 'excel', data: new Date().toISOString(), filtros: {} });
  res.json({ tipo: 'excel', registros: appStore.pesquisas.length, exportado: true });
});

router.get('/exportacoes/pdf', requireAuth, (_req, res) => {
  appStore.exportacoes.push({ id: appStore.exportacoes.length + 1, usuario_id: 1, tipo: 'pdf', data: new Date().toISOString(), filtros: {} });
  res.json({ tipo: 'pdf', registros: appStore.pesquisas.length, exportado: true });
});

export default router;
