import { Router } from 'express';
import { z } from 'zod';
import { appStore, getPesquisaById, getRespostaByPesquisaPergunta } from '../../shared/store.js';
import { calculateAverage, sortQuestionsForFlow } from '../../shared/metrics.js';
import { AppError } from '../../shared/errors.js';
import { asyncHandler, databaseConfigured, pool, query } from '../../config/database.js';
import { randomBytes } from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { env } from '../../config/env.js';

const router = Router();
const pesquisaLimiter = rateLimit({
  windowMs: env.pesquisaRateLimitWindowMs,
  max: env.pesquisaRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ erro: 'Muitas pesquisas iniciadas. Aguarde alguns minutos.', codigo: 'RATE_LIMITED' }),
});

const isValidIsoDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const createPesquisaSchema = z.object({
  setor_id: z.number().int().positive(),
  anonimo: z.boolean().optional().default(false),
  consentimento: z.boolean().optional().default(false),
  data_atendimento: z.string().refine(isValidIsoDate, { message: 'Use uma data válida no formato YYYY-MM-DD' }).optional(),
});

const respostaSchema = z.object({
  valor: z.number().int().min(0).max(10).optional(),
  texto: z.string().max(2000).optional(),
  opcao_id: z.number().int().optional(),
  pergunta_id: z.number().int().positive(),
});

const pacienteSchema = z.object({
  nome: z.string().max(120).optional(),
  nome_mae: z.string().optional(),
  data_nascimento: z.string().optional(),
  telefone: z.string().min(1).max(30).optional(),
  consentimento: z.boolean().default(false),
}).refine((data) => !data.consentimento || Boolean(data.telefone?.trim()), {
  message: 'Telefone obrigatório quando houver consentimento para contato',
  path: ['telefone'],
});

const requirePesquisaToken = asyncHandler(async (req, _res, next) => {
  const token = req.get('X-Pesquisa-Token');
  if (!token) throw new AppError('Token da pesquisa ausente ou inválido', 401, 'PESQUISA_TOKEN_INVALID');
  const id = Number(req.params.id);
  if (databaseConfigured) {
    const result = await query('SELECT id, token FROM pesquisa WHERE id = $1', [id]);
    if (!result.rowCount) throw new AppError('Pesquisa não encontrada', 404, 'PESQUISA_NOT_FOUND');
    if (result.rows[0].token !== token) throw new AppError('Token não pertence a esta pesquisa', 403, 'PESQUISA_TOKEN_FORBIDDEN');
  } else {
    const pesquisa = getPesquisaById(id);
    if (!pesquisa) throw new AppError('Pesquisa não encontrada', 404, 'PESQUISA_NOT_FOUND');
    if (pesquisa.token !== token) throw new AppError('Token não pertence a esta pesquisa', 403, 'PESQUISA_TOKEN_FORBIDDEN');
  }
  next();
});

router.get('/setores', asyncHandler(async (_req, res) => {
  if (databaseConfigured) {
    const result = await query('SELECT * FROM setor WHERE ativo = TRUE ORDER BY id');
    return res.json(result.rows);
  }
  res.json(appStore.setores.filter((setor) => setor.ativo));
}));

router.get('/setores/:slug', asyncHandler(async (req, res) => {
  if (databaseConfigured) {
    const result = await query('SELECT * FROM setor WHERE slug = $1 AND ativo = TRUE', [req.params.slug]);
    if (!result.rowCount) throw new AppError('Setor não encontrado', 404, 'SETOR_NOT_FOUND');
    return res.json(result.rows[0]);
  }
  const setor = appStore.setores.find((item) => item.slug === req.params.slug && item.ativo);
  if (!setor) {
    throw new AppError('Setor não encontrado', 404, 'SETOR_NOT_FOUND');
  }

  res.json(setor);
}));

router.get('/setores/:slug/fluxo', asyncHandler(async (req, res) => {
  if (databaseConfigured) {
    const result = await query(
      `SELECT s.*, p.id AS pergunta_id, p.texto, p.tipo, p.geral, p.todos_setores, p.ordem,
              p.obrigatoria, p.ativo AS pergunta_ativa,
              COALESCE(json_agg(json_build_object(
                'id', o.id, 'pergunta_id', o.pergunta_id, 'valor', o.valor,
                'rotulo', o.rotulo, 'emoji', o.emoji
              ) ORDER BY o.id) FILTER (WHERE o.id IS NOT NULL), '[]'::json) AS opcoes
       FROM setor s
       LEFT JOIN pergunta p ON p.ativo = TRUE AND (p.setor_id = s.id OR p.geral = TRUE OR p.todos_setores = TRUE)
       LEFT JOIN opcao_resposta o ON o.pergunta_id = p.id
       WHERE s.slug = $1 AND s.ativo = TRUE
       GROUP BY s.id, p.id
       ORDER BY p.geral, p.todos_setores, p.ordem`,
      [req.params.slug],
    );
    if (!result.rowCount) throw new AppError('Setor não encontrado', 404, 'SETOR_NOT_FOUND');
    const setor = Object.fromEntries(Object.entries(result.rows[0]).filter(([key]) => ![
      'pergunta_id', 'texto', 'tipo', 'geral', 'todos_setores', 'ordem', 'obrigatoria', 'pergunta_ativa', 'opcoes',
    ].includes(key)));
    const fluxo = result.rows.filter((row) => row.pergunta_id !== null).map((row, index) => ({
      id: row.pergunta_id,
      texto: row.texto,
      tipo: row.tipo,
      geral: row.geral,
      todos_setores: row.todos_setores,
      ordem: row.ordem,
      numero: index + 1,
      url: `/pesquisa/${setor.slug}/pergunta/${index + 1}`,
      opcoes: row.opcoes,
    }));
    return res.json({ setor, fluxo });
  }
  const setor = appStore.setores.find((item) => item.slug === req.params.slug && item.ativo);
  if (!setor) {
    throw new AppError('Setor não encontrado', 404, 'SETOR_NOT_FOUND');
  }

  const fluxo = sortQuestionsForFlow(appStore.perguntas
    .filter((pergunta) => pergunta.ativo && (pergunta.setor_id === setor.id || pergunta.geral || pergunta.todos_setores)))
    .map((pergunta, index) => ({
      id: pergunta.id,
      texto: pergunta.texto,
      tipo: pergunta.tipo,
      geral: pergunta.geral,
      todos_setores: pergunta.todos_setores ?? false,
      ordem: pergunta.ordem,
      numero: index + 1,
      url: `/pesquisa/${setor.slug}/pergunta/${index + 1}`,
      opcoes: appStore.opcoesResposta.filter((opcao) => opcao.pergunta_id === pergunta.id),
    }));

  res.json({ setor, fluxo });
}));

router.get('/setores/:slug/perguntas/:n', asyncHandler(async (req, res) => {
  if (databaseConfigured) {
    const result = await query(
      `SELECT p.*, COALESCE(json_agg(json_build_object(
        'id', o.id, 'pergunta_id', o.pergunta_id, 'valor', o.valor,
        'rotulo', o.rotulo, 'emoji', o.emoji
      ) ORDER BY o.id) FILTER (WHERE o.id IS NOT NULL), '[]'::json) AS opcoes
       FROM setor s
       JOIN pergunta p ON p.ativo = TRUE AND (p.setor_id = s.id OR p.geral = TRUE OR p.todos_setores = TRUE)
       LEFT JOIN opcao_resposta o ON o.pergunta_id = p.id
       WHERE s.slug = $1 AND s.ativo = TRUE
       GROUP BY s.id, p.id
       ORDER BY p.geral, p.todos_setores, p.ordem`,
      [req.params.slug],
    );
    if (!result.rowCount) throw new AppError('Setor ou pergunta não encontrado', 404, 'PERGUNTA_NOT_FOUND');
    const index = Number(req.params.n) - 1;
    const row = result.rows[index];
    if (!row) throw new AppError('Pergunta não encontrada', 404, 'PERGUNTA_NOT_FOUND');
    const { opcoes, ...pergunta } = row;
    return res.json({ pergunta, numero: index + 1, total: result.rowCount, opcoes });
  }
  const setor = appStore.setores.find((item) => item.slug === req.params.slug && item.ativo);
  if (!setor) {
    throw new AppError('Setor não encontrado', 404, 'SETOR_NOT_FOUND');
  }

  const fluxo = sortQuestionsForFlow(appStore.perguntas
    .filter((pergunta) => pergunta.ativo && (pergunta.setor_id === setor.id || pergunta.geral || pergunta.todos_setores)));

  const index = Number(req.params.n) - 1;
  const pergunta = fluxo[index];
  if (!pergunta) {
    throw new AppError('Pergunta não encontrada', 404, 'PERGUNTA_NOT_FOUND');
  }

  res.json({
    pergunta,
    numero: index + 1,
    total: fluxo.length,
    opcoes: appStore.opcoesResposta.filter((opcao) => opcao.pergunta_id === pergunta.id),
  });
}));

router.post('/pesquisas', pesquisaLimiter, asyncHandler(async (req, res) => {
  const payload = createPesquisaSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ erro: 'Dados inválidos', codigo: 'VALIDATION_ERROR', detalhes: payload.error.flatten() });
  }

  if (databaseConfigured) {
    const sectorResult = await query('SELECT id, slug FROM setor WHERE id = $1 AND ativo = TRUE', [payload.data.setor_id]);
    const setorDb = sectorResult.rows[0];
    if (!setorDb) return res.status(404).json({ erro: 'Setor não encontrado', codigo: 'SETOR_NOT_FOUND' });

    const token = randomBytes(24).toString('hex');
    const result = await query(
      `INSERT INTO pesquisa (setor_id, turno, anonimo, consentimento, data_atendimento, status, token)
       VALUES (
         $1,
         CASE
           WHEN EXTRACT(HOUR FROM NOW() AT TIME ZONE 'America/Sao_Paulo') < 12 THEN 'manha'
           WHEN EXTRACT(HOUR FROM NOW() AT TIME ZONE 'America/Sao_Paulo') < 18 THEN 'tarde'
           ELSE 'noite'
         END,
         $2, $3, $4, 'em_andamento', $5
       )
       RETURNING id, token`,
      [setorDb.id, payload.data.anonimo, payload.data.consentimento, payload.data.data_atendimento ?? null, token],
    );
    return res.status(201).json({ pesquisa_id: result.rows[0].id, token: result.rows[0].token, setor: setorDb.slug });
  }

  const setor = appStore.setores.find((item) => item.id === payload.data.setor_id && item.ativo);
  if (!setor) {
    return res.status(404).json({ erro: 'Setor não encontrado', codigo: 'SETOR_NOT_FOUND' });
  }

  const pesquisa = {
    id: appStore.pesquisas.length + 1,
    setor_id: setor.id,
    paciente_id: null,
    data_hora: new Date().toISOString(),
    data_atendimento: payload.data.data_atendimento ?? null,
    turno: 'manha',
    anonimo: payload.data.anonimo,
    consentimento: payload.data.consentimento,
    media_parcial: null,
    nps_nota: null,
    status: 'em_andamento',
    encaminhado_ouvidoria: false,
    ultima_atividade: new Date().toISOString(),
    token: `pesquisa-${Math.random().toString(36).slice(2, 12)}`,
  };

  appStore.pesquisas.push(pesquisa);
  return res.status(201).json({ pesquisa_id: pesquisa.id, token: pesquisa.token, setor: setor.slug });
}));

router.put('/pesquisas/:id/respostas/:perguntaId', requirePesquisaToken, asyncHandler(async (req, res) => {
  const payload = respostaSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ erro: 'Dados inválidos', codigo: 'VALIDATION_ERROR', detalhes: payload.error.flatten() });
  }

  if (databaseConfigured) {
    const surveyResult = await query('SELECT * FROM pesquisa WHERE id = $1', [Number(req.params.id)]);
    const pesquisaDb = surveyResult.rows[0];
    if (!pesquisaDb) throw new AppError('Pesquisa não encontrada', 404, 'PESQUISA_NOT_FOUND');
    if (pesquisaDb.status === 'concluida') throw new AppError('Pesquisa já concluída', 409, 'PESQUISA_CONCLUIDA');

    const questionResult = await query(
      `SELECT * FROM pergunta
       WHERE id = $1 AND ativo = TRUE AND (setor_id = $2 OR geral = TRUE OR todos_setores = TRUE)`,
      [Number(req.params.perguntaId), pesquisaDb.setor_id],
    );
    const perguntaDb = questionResult.rows[0];
    if (!perguntaDb) throw new AppError('Pergunta não encontrada', 404, 'PERGUNTA_NOT_FOUND');
    const d = payload.data;
    if (perguntaDb.tipo === 'rostinho' && (d.valor === undefined || d.valor < 1 || d.valor > 5)) {
      throw new AppError('Resposta inválida para pergunta rostinho', 400, 'RESPOSTA_INVALIDA');
    }
    if (perguntaDb.tipo === 'nps' && (d.valor === undefined || d.valor < 0 || d.valor > 10)) {
      throw new AppError('Resposta inválida para pergunta NPS', 400, 'RESPOSTA_INVALIDA');
    }
    if (perguntaDb.tipo === 'multipla') {
      if (d.opcao_id === undefined) throw new AppError('opcao_id é obrigatório', 400, 'RESPOSTA_INVALIDA');
      const option = await query('SELECT id FROM opcao_resposta WHERE id = $1 AND pergunta_id = $2', [d.opcao_id, perguntaDb.id]);
      if (!option.rowCount) throw new AppError('opcao_id não pertence à pergunta', 400, 'RESPOSTA_INVALIDA');
    }
    if (perguntaDb.tipo === 'texto' && (d.texto === undefined || d.texto.trim() === '' || d.valor !== undefined || d.opcao_id !== undefined)) {
      throw new AppError('Resposta de texto inválida', 400, 'RESPOSTA_INVALIDA');
    }

    await query(
      `INSERT INTO resposta (pesquisa_id, pergunta_id, opcao_id, valor, texto)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (pesquisa_id, pergunta_id)
       DO UPDATE SET opcao_id = EXCLUDED.opcao_id, valor = EXCLUDED.valor, texto = EXCLUDED.texto`,
      [pesquisaDb.id, perguntaDb.id, payload.data.opcao_id ?? null, payload.data.valor ?? null, payload.data.texto ?? null],
    );

    const metrics = await query(
      `SELECT ROUND(AVG(r.valor)::numeric, 1) AS media
       FROM resposta r
       JOIN pergunta p ON p.id = r.pergunta_id
       WHERE r.pesquisa_id = $1 AND p.geral = FALSE AND r.valor BETWEEN 1 AND 5`,
      [pesquisaDb.id],
    );
    const mediaParcial = metrics.rows[0].media === null ? null : Number(metrics.rows[0].media);
    const npsNota = perguntaDb.geral && perguntaDb.tipo === 'nps'
      ? payload.data.valor ?? null
      : pesquisaDb.nps_nota;
    await query(
      `UPDATE pesquisa
       SET media_parcial = $2, nps_nota = $3, ultima_atividade = NOW()
       WHERE id = $1`,
      [pesquisaDb.id, mediaParcial, npsNota],
    );

    return res.json({
      ok: true,
      mediaParcial,
      ultima: perguntaDb.geral,
    });
  }

  const pesquisa = getPesquisaById(Number(req.params.id));
  if (!pesquisa) {
    throw new AppError('Pesquisa não encontrada', 404, 'PESQUISA_NOT_FOUND');
  }
  if (pesquisa.status === 'concluida') throw new AppError('Pesquisa já concluída', 409, 'PESQUISA_CONCLUIDA');

  const pergunta = appStore.perguntas.find((item) => item.id === Number(req.params.perguntaId)
    && item.ativo
    && (item.setor_id === pesquisa.setor_id || item.geral || item.todos_setores));
  if (!pergunta) {
    throw new AppError('Pergunta não encontrada', 404, 'PERGUNTA_NOT_FOUND');
  }
  const d = payload.data;
  if (pergunta.tipo === 'rostinho' && (d.valor === undefined || d.valor < 1 || d.valor > 5)) throw new AppError('Resposta inválida para pergunta rostinho', 400, 'RESPOSTA_INVALIDA');
  if (pergunta.tipo === 'nps' && (d.valor === undefined || d.valor < 0 || d.valor > 10)) throw new AppError('Resposta inválida para pergunta NPS', 400, 'RESPOSTA_INVALIDA');
  if (pergunta.tipo === 'multipla') {
    if (d.opcao_id === undefined) throw new AppError('opcao_id é obrigatório', 400, 'RESPOSTA_INVALIDA');
    if (!appStore.opcoesResposta.some((option) => option.id === d.opcao_id && option.pergunta_id === pergunta.id)) throw new AppError('opcao_id não pertence à pergunta', 400, 'RESPOSTA_INVALIDA');
  }
  if (pergunta.tipo === 'texto' && (d.texto === undefined || d.texto.trim() === '' || d.valor !== undefined || d.opcao_id !== undefined)) throw new AppError('Resposta de texto inválida', 400, 'RESPOSTA_INVALIDA');

  const existing = getRespostaByPesquisaPergunta(pesquisa.id, pergunta.id);
  const resposta = {
    id: existing?.id ?? appStore.respostas.length + 1,
    pesquisa_id: pesquisa.id,
    pergunta_id: pergunta.id,
    opcao_id: payload.data.opcao_id ?? null,
    valor: payload.data.valor ?? null,
    texto: payload.data.texto ?? null,
  };

  if (existing) {
    const index = appStore.respostas.findIndex((item) => item.id === existing.id);
    appStore.respostas[index] = resposta;
  } else {
    appStore.respostas.push(resposta);
  }

  const respostasDoSetor = appStore.respostas.filter((item) => item.pesquisa_id === pesquisa.id && item.valor !== null && item.valor >= 1 && item.valor <= 5);
  pesquisa.media_parcial = calculateAverage(respostasDoSetor.map((item) => item.valor)) ?? null;

  if (pergunta.geral && pergunta.tipo === 'nps') {
    pesquisa.nps_nota = payload.data.valor ?? null;
  }

  pesquisa.ultima_atividade = new Date().toISOString();

  return res.json({
    ok: true,
    mediaParcial: pesquisa.media_parcial,
    ultima: pergunta.geral,
  });
}));

router.post('/pesquisas/:id/finalizar', requirePesquisaToken, asyncHandler(async (req, res) => {
  if (databaseConfigured) {
    const result = await query('SELECT * FROM pesquisa WHERE id = $1', [Number(req.params.id)]);
    const pesquisaDb = result.rows[0];
    if (!pesquisaDb) throw new AppError('Pesquisa não encontrada', 404, 'PESQUISA_NOT_FOUND');
    if (pesquisaDb.status === 'concluida') {
      const encaminharIdempotente = Number(pesquisaDb.nps_nota) <= 6;
      return res.json({
        destino: encaminharIdempotente ? 'ouvidoria' : 'agradecimento',
        motivo: encaminharIdempotente ? 'nps_baixo' : 'nps_adequado',
      });
    }
    if (pesquisaDb.nps_nota === null) {
      return res.status(422).json({ erro: 'NPS obrigatório antes de finalizar', codigo: 'NPS_REQUIRED' });
    }

    const encaminhar = Number(pesquisaDb.nps_nota) <= 6;
    await query(
      `UPDATE pesquisa
       SET status = 'concluida', encaminhado_ouvidoria = $2, ultima_atividade = NOW()
       WHERE id = $1`,
      [pesquisaDb.id, encaminhar],
    );
    return res.json({
      destino: encaminhar ? 'ouvidoria' : 'agradecimento',
      motivo: encaminhar ? 'nps_baixo' : 'nps_adequado',
    });
  }

  const pesquisa = getPesquisaById(Number(req.params.id));
  if (!pesquisa) {
    throw new AppError('Pesquisa não encontrada', 404, 'PESQUISA_NOT_FOUND');
  }

  if (pesquisa.status === 'concluida') {
    const encaminharIdempotente = Number(pesquisa.nps_nota) <= 6;
    return res.json({
      destino: encaminharIdempotente ? 'ouvidoria' : 'agradecimento',
      motivo: encaminharIdempotente ? 'nps_baixo' : 'nps_adequado',
    });
  }
  if (pesquisa.nps_nota === null || pesquisa.nps_nota === undefined) {
    return res.status(422).json({ erro: 'NPS obrigatório antes de finalizar', codigo: 'NPS_REQUIRED' });
  }

  pesquisa.status = 'concluida';
  pesquisa.ultima_atividade = new Date().toISOString();

  const encaminharOuvidoria = Number(pesquisa.nps_nota) <= 6;
  pesquisa.encaminhado_ouvidoria = encaminharOuvidoria;

  return res.json({
    destino: encaminharOuvidoria ? 'ouvidoria' : 'agradecimento',
    motivo: encaminharOuvidoria ? 'nps_baixo' : 'nps_adequado',
  });
}));

router.post('/pesquisas/:id/paciente', requirePesquisaToken, asyncHandler(async (req, res) => {
  const payload = pacienteSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ erro: 'Dados inválidos', codigo: 'VALIDATION_ERROR', detalhes: payload.error.flatten() });
  }

  if (databaseConfigured) {
    const surveyResult = await query('SELECT id, status FROM pesquisa WHERE id = $1', [Number(req.params.id)]);
    const survey = surveyResult.rows[0];
    if (!survey) throw new AppError('Pesquisa não encontrada', 404, 'PESQUISA_NOT_FOUND');
    if (survey.status === 'concluida') throw new AppError('Pesquisa já concluída', 409, 'PESQUISA_CONCLUIDA');
    if (!payload.data.consentimento) {
      return res.status(400).json({ erro: 'Consentimento explícito obrigatório', codigo: 'CONSENTIMENTO_INVALIDO' });
    }
    const patient = await query(
      `INSERT INTO paciente (nome, nome_mae, data_nascimento, telefone, consentimento)
       VALUES ($1, NULL, NULL, $2, TRUE)
       RETURNING id`,
      [
        payload.data.nome ?? null,
        payload.data.telefone ?? null,
      ],
    );
    await query('UPDATE pesquisa SET paciente_id = $2, anonimo = FALSE, consentimento = TRUE WHERE id = $1', [survey.id, patient.rows[0].id]);
    return res.status(201).json({ ok: true });
  }

  const pesquisa = getPesquisaById(Number(req.params.id));
  if (!pesquisa) {
    throw new AppError('Pesquisa não encontrada', 404, 'PESQUISA_NOT_FOUND');
  }
  if (pesquisa.status === 'concluida') throw new AppError('Pesquisa já concluída', 409, 'PESQUISA_CONCLUIDA');
  if (!payload.data.consentimento) {
    return res.status(400).json({ erro: 'Consentimento explícito obrigatório', codigo: 'CONSENTIMENTO_INVALIDO' });
  }

  const paciente = {
    id: appStore.pacientes.length + 1,
    nome: payload.data.nome ?? null,
    telefone: payload.data.telefone ?? null,
    consentimento: true,
    criado_em: new Date().toISOString(),
  };
  appStore.pacientes.push(paciente);
  pesquisa.paciente_id = paciente.id;
  pesquisa.anonimo = false;
  pesquisa.consentimento = true;

  return res.status(201).json({ ok: true });
}));

router.post('/pesquisas/:id/manifestacoes', requirePesquisaToken, asyncHandler(async (req, res) => {
  const schema = z.object({
    tipo: z.enum(['elogio', 'reclamacao', 'sugestao']),
    descricao: z.string().max(2000).optional().default(''),
    contato: z.object({
      nome: z.string().max(120).optional(),
      telefone: z.string(),
      consentimento: z.literal(true),
    }).optional(),
    anonimo: z.boolean().optional(),
    canal_contato: z.string().optional(),
  });
  const payload = schema.safeParse(req.body);
  if (!payload.success) {
    const fieldErrors = {};
    for (const issue of payload.error.issues) {
      const field = issue.path[issue.path.length - 1];
      if (['telefone', 'consentimento', 'descricao', 'nome'].includes(String(field))) {
        fieldErrors[field] = [...(fieldErrors[field] ?? []), issue.message];
      }
    }
    return res.status(400).json({ erro: 'Dados inválidos', codigo: 'VALIDATION_ERROR', detalhes: { fieldErrors } });
  }

  const contact = payload.data.contato;
  let phone = null;
  if (contact) {
    let digits = contact.telefone.replace(/\D/g, '');
    if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) digits = digits.slice(2);
    if (!/^\d{10,11}$/.test(digits)) {
      return res.status(400).json({ erro: 'Dados inválidos', codigo: 'VALIDATION_ERROR', detalhes: { fieldErrors: { telefone: ['Informe um telefone válido com DDD'] } } });
    }
    phone = digits;
  }
  if (!contact && payload.data.descricao.trim().length > 0 && payload.data.descricao.trim().length < 5) {
    return res.status(400).json({ erro: 'Dados inválidos', codigo: 'VALIDATION_ERROR', detalhes: { fieldErrors: { descricao: ['Descrição deve ter pelo menos 5 caracteres'] } } });
  }
  if (!contact && !payload.data.descricao.trim()) {
    return res.status(400).json({ erro: 'Dados inválidos', codigo: 'VALIDATION_ERROR', detalhes: { fieldErrors: { descricao: ['Descrição deve ter pelo menos 5 caracteres'] } } });
  }
  const description = contact && payload.data.descricao.trim() === ''
    ? 'O paciente pediu retorno da Ouvidoria (sem relato escrito).'
    : payload.data.descricao.trim();

  if (databaseConfigured) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query('SELECT id, status, media_parcial, consentimento, anonimo FROM pesquisa WHERE id = $1 FOR UPDATE', [Number(req.params.id)]);
      const survey = result.rows[0];
      if (!survey) throw new AppError('Pesquisa não encontrada', 404, 'PESQUISA_NOT_FOUND');
      if (!['concluida', 'em_andamento'].includes(survey.status)) throw new AppError('Pesquisa não permite manifestações', 409, 'PESQUISA_CONCLUIDA');
      if (survey.status === 'em_andamento') {
        const count = await client.query('SELECT COUNT(*)::integer AS total FROM manifestacao WHERE pesquisa_id = $1', [survey.id]);
        if (count.rows[0].total >= 3) throw new AppError('Limite de 3 manifestações por pesquisa atingido', 409, 'MANIFESTACAO_LIMITE');
      }
      const count = await client.query('SELECT COUNT(*)::integer AS total FROM manifestacao WHERE pesquisa_id = $1', [survey.id]);
      if (count.rows[0].total >= 3) throw new AppError('Limite de 3 manifestações por pesquisa atingido', 409, 'MANIFESTACAO_LIMITE');

      let patientId = null;
      if (contact) {
        const patient = await client.query(
          `INSERT INTO paciente (nome, telefone, consentimento) VALUES ($1, $2, TRUE) RETURNING id`,
          [contact.nome ?? null, phone],
        );
        patientId = patient.rows[0].id;
        await client.query(
          `UPDATE pesquisa SET paciente_id = $2, anonimo = FALSE, consentimento = TRUE, ultima_atividade = NOW() WHERE id = $1`,
          [survey.id, patientId],
        );
      }
      const inserted = await client.query(
        `INSERT INTO manifestacao (pesquisa_id, tipo, descricao, status, anonimo, origem, media_origem, canal_contato)
         VALUES ($1, $2, $3, 'aberta', $4, 'pesquisa', $5, $6) RETURNING id, tipo, status`,
        [survey.id, payload.data.tipo, description, !contact, survey.media_parcial, phone],
      );
      await client.query('COMMIT');
      return res.status(201).json({
        id: inserted.rows[0].id,
        tipo: inserted.rows[0].tipo,
        status: inserted.rows[0].status,
        contato_registrado: Boolean(contact),
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  const pesquisa = getPesquisaById(Number(req.params.id));
  if (!pesquisa) throw new AppError('Pesquisa não encontrada', 404, 'PESQUISA_NOT_FOUND');
  if (!['concluida', 'em_andamento'].includes(pesquisa.status)) throw new AppError('Pesquisa não permite manifestações', 409, 'PESQUISA_CONCLUIDA');
  const existing = appStore.manifestacoes.filter((item) => item.pesquisa_id === pesquisa.id);
  if (existing.length >= 3) throw new AppError('Limite de 3 manifestações por pesquisa atingido', 409, 'MANIFESTACAO_LIMITE');
  let patientId = null;
  if (contact) {
    patientId = appStore.pacientes.length + 1;
    appStore.pacientes.push({ id: patientId, nome: contact.nome ?? null, telefone: phone, consentimento: true, criado_em: new Date().toISOString() });
    pesquisa.paciente_id = patientId;
    pesquisa.anonimo = false;
    pesquisa.consentimento = true;
  }
  const manifestacao = {
    id: appStore.manifestacoes.length + 1,
    pesquisa_id: pesquisa.id,
    tipo: payload.data.tipo,
    descricao: description,
    status: 'aberta',
    data: new Date().toISOString(),
    anonimo: !contact,
    origem: 'pesquisa',
    media_origem: pesquisa.media_parcial,
    motivo_encaminhamento: null,
    canal_contato: phone,
    parecer_interno: null,
  };
  appStore.manifestacoes.push(manifestacao);
  return res.status(201).json({ id: manifestacao.id, tipo: manifestacao.tipo, status: manifestacao.status, contato_registrado: Boolean(contact) });
}));

export default router;
