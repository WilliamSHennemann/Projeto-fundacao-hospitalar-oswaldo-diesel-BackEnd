import { Router } from 'express';
import { z } from 'zod';
import { appStore } from '../../shared/store.js';
import { calculateAverage, calculateNps } from '../../shared/metrics.js';
import { AppError } from '../../shared/errors.js';
import { requireAuth, requireAnyPermission } from '../auth/auth.routes.js';
import { asyncHandler, databaseConfigured, query } from '../../config/database.js';

const router = Router();
const filterSchema = z.object({
  inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  setor_id: z.coerce.number().int().positive().optional(),
}).refine(({ inicio, fim }) => !inicio || !fim || inicio <= fim, { message: '`inicio` deve ser anterior ou igual a `fim`' });

function parseFilters(req) {
  const parsed = filterSchema.safeParse(req.query);
  if (!parsed.success) throw new AppError('Filtros inválidos', 400, 'VALIDATION_ERROR', parsed.error.flatten());
  const filters = parsed.data;
  for (const date of [filters.inicio, filters.fim].filter(Boolean)) {
    const parsedDate = new Date(`${date}T00:00:00.000Z`);
    if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
      throw new AppError('Data inválida; use YYYY-MM-DD', 400, 'VALIDATION_ERROR');
    }
  }
  return filters;
}

function dbWhere(filters, alias = 'p', startIndex = 1) {
  const values = [];
  const parts = [];
  if (filters.inicio) { values.push(filters.inicio); parts.push(`(${alias}.data_hora AT TIME ZONE 'America/Sao_Paulo') >= $${startIndex + values.length - 1}::date`); }
  if (filters.fim) { values.push(filters.fim); parts.push(`(${alias}.data_hora AT TIME ZONE 'America/Sao_Paulo') < ($${startIndex + values.length - 1}::date + INTERVAL '1 day')`); }
  if (filters.setor_id) { values.push(filters.setor_id); parts.push(`${alias}.setor_id = $${startIndex + values.length - 1}`); }
  return { sql: parts.length ? `WHERE ${parts.join(' AND ')}` : '', values };
}

function matchesFilters(pesquisa, filters) {
  const date = new Date(pesquisa.data_hora ?? pesquisa.ultima_atividade);
  if (Number.isNaN(date.getTime())) return false;
  const dateKey = date.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  if (filters.inicio && dateKey < filters.inicio) return false;
  if (filters.fim && dateKey > filters.fim) return false;
  return !filters.setor_id || pesquisa.setor_id === filters.setor_id;
}

const dashboardPermission = requireAnyPermission('super_admin', 'gestao', 'ouvidoria', 'visu');

router.get('/dashboard/resumo', requireAuth, dashboardPermission, asyncHandler(async (req, res) => {
  const filters = parseFilters(req);
  if (databaseConfigured) {
    const where = dbWhere(filters);
    const result = await query(
      `SELECT COUNT(*)::integer AS total,
              COUNT(*) FILTER (WHERE p.status = 'parcial')::integer AS parciais,
              AVG(p.media_parcial) AS media,
              ARRAY_AGG(p.nps_nota) FILTER (WHERE p.nps_nota IS NOT NULL) AS notas
       FROM pesquisa p ${where.sql}`,
      where.values,
    );
    const row = result.rows[0];
    return res.json({
      nps_geral: calculateNps((row.notas ?? []).map(Number)),
      media_geral: row.media === null ? null : Number(Number(row.media).toFixed(1)),
      total_pesquisas: row.total,
      percentual_parciais: row.total ? (row.parciais / row.total) * 100 : 0,
      periodo: filters.inicio || filters.fim ? { inicio: filters.inicio ?? null, fim: filters.fim ?? null } : 'all',
    });
  }
  const pesquisas = appStore.pesquisas.filter((item) => matchesFilters(item, filters));
  const parciais = pesquisas.filter((item) => item.status === 'parcial').length;
  return res.json({
    nps_geral: calculateNps(pesquisas.filter((item) => item.nps_nota !== null).map((item) => item.nps_nota)),
    media_geral: calculateAverage(pesquisas.map((item) => item.media_parcial)),
    total_pesquisas: pesquisas.length,
    percentual_parciais: pesquisas.length ? (parciais / pesquisas.length) * 100 : 0,
    periodo: filters.inicio || filters.fim ? { inicio: filters.inicio ?? null, fim: filters.fim ?? null } : 'all',
  });
}));

router.get('/dashboard/setores', requireAuth, dashboardPermission, asyncHandler(async (req, res) => {
  const filters = parseFilters(req);
  if (databaseConfigured) {
    const values = [];
    const on = [];
    if (filters.inicio) { values.push(filters.inicio); on.push(`(p.data_hora AT TIME ZONE 'America/Sao_Paulo') >= $${values.length}::date`); }
    if (filters.fim) { values.push(filters.fim); on.push(`(p.data_hora AT TIME ZONE 'America/Sao_Paulo') < ($${values.length}::date + INTERVAL '1 day')`); }
    if (filters.setor_id) { values.push(filters.setor_id); on.push(`p.setor_id = $${values.length}`); }
    const result = await query(
      `SELECT s.id AS setor_id, s.nome,
              ARRAY_AGG(p.nps_nota) FILTER (WHERE p.nps_nota IS NOT NULL) AS notas,
              AVG(p.media_parcial) FILTER (WHERE p.media_parcial IS NOT NULL) AS media
       FROM setor s LEFT JOIN pesquisa p ON p.setor_id = s.id${on.length ? ` AND ${on.join(' AND ')}` : ''}
       WHERE s.ativo = TRUE GROUP BY s.id ORDER BY s.id`, values,
    );
    return res.json(result.rows.map((row) => ({ setor_id: row.setor_id, nome: row.nome, nps: calculateNps((row.notas ?? []).map(Number)), media: row.media === null ? null : Number(Number(row.media).toFixed(1)) })));
  }
  const setores = appStore.setores.filter((setor) => setor.ativo && (!filters.setor_id || setor.id === filters.setor_id)).map((setor) => {
    const pesquisas = appStore.pesquisas.filter((item) => item.setor_id === setor.id && matchesFilters(item, filters));
    return { setor_id: setor.id, nome: setor.nome, nps: calculateNps(pesquisas.filter((item) => item.nps_nota !== null).map((item) => item.nps_nota)), media: calculateAverage(pesquisas.map((item) => item.media_parcial)) };
  });
  return res.json(setores);
}));

router.get('/dashboard/setores/:id/turnos', requireAuth, dashboardPermission, asyncHandler(async (req, res) => {
  const setorId = Number(req.params.id);
  if (!Number.isInteger(setorId) || setorId < 1) throw new AppError('ID do setor inválido', 400, 'VALIDATION_ERROR');
  const filters = parseFilters(req);
  if (filters.setor_id && filters.setor_id !== setorId) throw new AppError('setor_id deve corresponder ao ID da rota', 400, 'VALIDATION_ERROR');
  const turnos = ['manha', 'tarde', 'noite'];
  if (databaseConfigured) {
    const values = [setorId]; const conditions = ['p.setor_id = $1'];
    if (filters.inicio) { values.push(filters.inicio); conditions.push(`(p.data_hora AT TIME ZONE 'America/Sao_Paulo') >= $${values.length}::date`); }
    if (filters.fim) { values.push(filters.fim); conditions.push(`(p.data_hora AT TIME ZONE 'America/Sao_Paulo') < ($${values.length}::date + INTERVAL '1 day')`); }
    const result = await query(
      `SELECT p.turno, COUNT(*) FILTER (WHERE p.nps_nota IS NOT NULL)::integer AS total,
              ARRAY_AGG(p.nps_nota) FILTER (WHERE p.nps_nota IS NOT NULL) AS notas,
              AVG(p.media_parcial) FILTER (WHERE p.media_parcial IS NOT NULL) AS media
       FROM pesquisa p WHERE ${conditions.join(' AND ')} GROUP BY p.turno`, values,
    );
    const byTurn = new Map(result.rows.map((row) => [row.turno, row]));
    return res.json(turnos.map((turno) => { const row = byTurn.get(turno); return { turno, total: row?.total ?? 0, nps: calculateNps((row?.notas ?? []).map(Number)), media: row?.media == null ? null : Number(Number(row.media).toFixed(1)) }; }));
  }
  return res.json(turnos.map((turno) => {
    const pesquisas = appStore.pesquisas.filter((item) => item.setor_id === setorId && item.turno === turno && matchesFilters(item, filters));
    return { turno, total: pesquisas.filter((item) => item.nps_nota !== null).length, nps: calculateNps(pesquisas.filter((item) => item.nps_nota !== null).map((item) => item.nps_nota)), media: calculateAverage(pesquisas.map((item) => item.media_parcial)) };
  }));
}));

router.get('/dashboard/equipes', requireAuth, dashboardPermission, (_req, res) => {
  res.json({ melhores: [], piores: [], resumo: 'Criação da equipe vinculada por setor, data e turno no módulo administrativo' });
});

router.get('/dashboard/em-andamento', requireAuth, dashboardPermission, asyncHandler(async (req, res) => {
  const filters = parseFilters(req);
  if (databaseConfigured) {
    const where = dbWhere(filters);
    const conditions = [`p.status = 'em_andamento'`, ...(where.sql ? [where.sql.replace(/^WHERE /, '')] : [])];
    const result = await query(`SELECT p.id, p.setor_id, p.media_parcial, p.ultima_atividade, p.status FROM pesquisa p WHERE ${conditions.join(' AND ')} ORDER BY p.ultima_atividade DESC`, where.values);
    return res.json(result.rows);
  }
  return res.json(appStore.pesquisas.filter((item) => item.status === 'em_andamento' && matchesFilters(item, filters)).map((pesquisa) => ({ id: pesquisa.id, setor_id: pesquisa.setor_id, media_parcial: pesquisa.media_parcial, ultima_atividade: pesquisa.ultima_atividade, status: pesquisa.status })));
}));

export default router;
