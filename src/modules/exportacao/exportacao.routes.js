import { Router } from 'express';
import { appStore } from '../../shared/store.js';
import { requireAuth } from '../auth/auth.routes.js';
import { asyncHandler, databaseConfigured, query } from '../../config/database.js';

const router = Router();

const createExportHandler = (tipo) => asyncHandler(async (req, res) => {
  if (databaseConfigured) {
    const [recordCount, exportRecord] = await Promise.all([
      query('SELECT COUNT(*)::integer AS total FROM pesquisa'),
      query(
        `INSERT INTO exportacao (usuario_id, tipo, filtros)
         VALUES ($1, $2, '{}'::jsonb)
         RETURNING id`,
        [req.user.id, tipo],
      ),
    ]);
    return res.json({ tipo, registros: recordCount.rows[0].total, exportado: true, exportacao_id: exportRecord.rows[0].id });
  }
  appStore.exportacoes.push({ id: appStore.exportacoes.length + 1, usuario_id: req.user.id, tipo, data: new Date().toISOString(), filtros: {} });
  res.json({ tipo, registros: appStore.pesquisas.length, exportado: true });
});

router.get('/exportacoes/excel', requireAuth, createExportHandler('excel'));
router.get('/exportacoes/pdf', requireAuth, createExportHandler('pdf'));

export default router;
