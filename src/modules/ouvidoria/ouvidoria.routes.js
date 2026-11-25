import { Router } from 'express';
import { z } from 'zod';
import { appStore } from '../../shared/store.js';
import { requireAuth, requirePermission } from '../auth/auth.routes.js';
import { asyncHandler, databaseConfigured, query } from '../../config/database.js';

const router = Router();

async function addManifestationContext(manifestation) {
  const [survey, answers, sector, patient] = await Promise.all([
    query('SELECT id, setor_id, paciente_id, nps_nota, media_parcial, consentimento FROM pesquisa WHERE id = $1', [manifestation.pesquisa_id]),
    query(`SELECT r.*, p.texto AS pergunta_texto
           FROM resposta r LEFT JOIN pergunta p ON p.id = r.pergunta_id
           WHERE r.pesquisa_id = $1 ORDER BY r.id`, [manifestation.pesquisa_id]),
    query('SELECT s.id, s.nome FROM setor s JOIN pesquisa p ON p.setor_id = s.id WHERE p.id = $1', [manifestation.pesquisa_id]),
    query('SELECT pa.nome, pa.telefone, pa.consentimento FROM paciente pa JOIN pesquisa p ON p.paciente_id = pa.id WHERE p.id = $1 AND p.consentimento = TRUE AND pa.consentimento = TRUE', [manifestation.pesquisa_id]),
  ]);
  const patientRow = patient.rows[0] ?? null;
  return { ...manifestation, canal_contato: patientRow ? manifestation.canal_contato : null, setor: sector.rows[0] ?? null, pesquisa: survey.rows[0] ?? null, respostas: answers.rows, paciente: patientRow };
}

function addMemoryManifestationContext(manifestation) {
  const survey = appStore.pesquisas.find((item) => item.id === manifestation.pesquisa_id);
  const patient = survey?.consentimento === true
    ? appStore.pacientes.find((item) => item.id === survey.paciente_id && item.consentimento === true)
    : null;
  const sector = appStore.setores.find((item) => item.id === survey?.setor_id);
  return {
    ...manifestation,
    canal_contato: patient ? manifestation.canal_contato ?? null : null,
    setor: sector ? { id: sector.id, nome: sector.nome } : null,
    pesquisa: survey ? { id: survey.id, nps_nota: survey.nps_nota, media_parcial: survey.media_parcial } : null,
    respostas: appStore.respostas
      .filter((item) => item.pesquisa_id === manifestation.pesquisa_id)
      .map((item) => ({
        ...item,
        pergunta_texto: appStore.perguntas.find((question) => question.id === item.pergunta_id)?.texto ?? null,
      })),
    paciente: patient ? { nome: patient.nome ?? null, telefone: patient.telefone ?? null, consentimento: true } : null,
  };
}

router.get('/manifestacoes', requireAuth, requirePermission('ouvidoria'), asyncHandler(async (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50) || 50));
  const offset = Math.max(0, Number(req.query.offset ?? 0) || 0);
  const status = ['aberta', 'em_tratamento', 'concluida'].includes(String(req.query.status)) ? String(req.query.status) : null;
  const tipo = ['elogio', 'reclamacao', 'sugestao'].includes(String(req.query.tipo)) ? String(req.query.tipo) : null;
  if (databaseConfigured) {
    const values = [];
    const filters = [];
    if (status) { values.push(status); filters.push(`m.status = $${values.length}`); }
    if (tipo) { values.push(tipo); filters.push(`m.tipo = $${values.length}`); }
    values.push(limit, offset);
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const result = await query(
      `SELECT m.id, m.pesquisa_id, m.tipo, m.descricao, m.status, m.data, m.anonimo, m.origem,
              m.media_origem, m.motivo_encaminhamento, m.parecer_interno,
              CASE WHEN p.consentimento = TRUE AND pa.consentimento = TRUE THEN m.canal_contato ELSE NULL END AS canal_contato,
              json_build_object('id', s.id, 'nome', s.nome) AS setor,
              json_build_object('id', p.id, 'nps_nota', p.nps_nota, 'media_parcial', p.media_parcial) AS pesquisa,
              COALESCE((SELECT json_agg(jsonb_build_object(
                'id', r.id, 'pesquisa_id', r.pesquisa_id, 'pergunta_id', r.pergunta_id,
                'opcao_id', r.opcao_id, 'valor', r.valor, 'texto', r.texto,
                'pergunta_texto', pq.texto
              ) ORDER BY r.id) FROM resposta r LEFT JOIN pergunta pq ON pq.id = r.pergunta_id WHERE r.pesquisa_id = p.id), '[]'::json) AS respostas,
              CASE WHEN p.consentimento = TRUE AND pa.consentimento = TRUE
                THEN json_build_object('nome', pa.nome, 'telefone', pa.telefone, 'consentimento', TRUE)
                ELSE NULL END AS paciente
       FROM manifestacao m
       JOIN pesquisa p ON p.id = m.pesquisa_id
       JOIN setor s ON s.id = p.setor_id
       LEFT JOIN paciente pa ON pa.id = p.paciente_id
       ${where}
       ORDER BY m.data DESC, m.id DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    const countValues = values.slice(0, -2);
    const countResult = await query(`SELECT COUNT(*)::integer AS total FROM manifestacao m ${where}`, countValues);
    res.set('X-Total-Count', String(countResult.rows[0].total));
    return res.json(result.rows);
  }
  let manifestations = appStore.manifestacoes.filter((item) =>
    (!status || item.status === status) && (!tipo || item.tipo === tipo));
  const total = manifestations.length;
  manifestations = manifestations.sort((a, b) => String(b.data).localeCompare(String(a.data))).slice(offset, offset + limit);
  res.set('X-Total-Count', String(total));
  res.json(manifestations.map(addMemoryManifestationContext));
}));

router.get('/manifestacoes/:id', requireAuth, requirePermission('ouvidoria'), asyncHandler(async (req, res) => {
  if (databaseConfigured) {
    const result = await query('SELECT * FROM manifestacao WHERE id = $1', [Number(req.params.id)]);
    const manifestacaoDb = result.rows[0];
    if (!manifestacaoDb) {
      return res.status(404).json({ erro: 'Manifestação não encontrada', codigo: 'MANIFESTACAO_NOT_FOUND' });
    }
    return res.json(await addManifestationContext(manifestacaoDb));
  }
  const manifestacao = appStore.manifestacoes.find((item) => item.id === Number(req.params.id));
  if (!manifestacao) {
    return res.status(404).json({ erro: 'Manifestação não encontrada', codigo: 'MANIFESTACAO_NOT_FOUND' });
  }

  return res.json(addMemoryManifestationContext(manifestacao));
}));

router.patch('/manifestacoes/:id', requireAuth, requirePermission('ouvidoria'), asyncHandler(async (req, res) => {
  const schema = z.object({
    status: z.enum(['aberta', 'em_tratamento', 'concluida']).optional(),
    parecer_interno: z.string().max(4000).optional(),
  });

  const payload = schema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ erro: 'Dados inválidos', codigo: 'VALIDATION_ERROR', detalhes: payload.error.flatten() });
  }

  if (databaseConfigured) {
    const result = await query(
      `UPDATE manifestacao
       SET status = COALESCE($2, status),
           parecer_interno = COALESCE($3, parecer_interno)
       WHERE id = $1
       RETURNING *`,
      [Number(req.params.id), payload.data.status ?? null, payload.data.parecer_interno ?? null],
    );
    if (!result.rowCount) {
      return res.status(404).json({ erro: 'Manifestação não encontrada', codigo: 'MANIFESTACAO_NOT_FOUND' });
    }
    return res.json(await addManifestationContext(result.rows[0]));
  }

  const manifestacao = appStore.manifestacoes.find((item) => item.id === Number(req.params.id));
  if (!manifestacao) {
    return res.status(404).json({ erro: 'Manifestação não encontrada', codigo: 'MANIFESTACAO_NOT_FOUND' });
  }
  Object.assign(manifestacao, payload.data);
  return res.json(addMemoryManifestationContext(manifestacao));
}));

export default router;
