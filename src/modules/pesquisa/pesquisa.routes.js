import { Router } from 'express';
import { z } from 'zod';
import { appStore, getPesquisaById, getRespostaByPesquisaPergunta } from '../../shared/store.js';
import { calculateAverage } from '../../shared/metrics.js';
import { AppError } from '../../shared/errors.js';

const router = Router();

const createPesquisaSchema = z.object({
  setor_id: z.number().int().positive(),
  anonimo: z.boolean().optional().default(false),
  consentimento: z.boolean().optional().default(false),
});

const respostaSchema = z.object({
  valor: z.number().int().min(1).max(5).optional(),
  texto: z.string().optional(),
  opcao_id: z.number().int().optional(),
  pergunta_id: z.number().int().positive(),
});

const pacienteSchema = z.object({
  nome: z.string().optional(),
  nome_mae: z.string().optional(),
  data_nascimento: z.string().optional(),
  telefone: z.string().optional(),
  consentimento: z.boolean().default(false),
});

router.get('/setores', (_req, res) => {
  res.json(appStore.setores.filter((setor) => setor.ativo));
});

router.get('/setores/:slug', (req, res) => {
  const setor = appStore.setores.find((item) => item.slug === req.params.slug && item.ativo);
  if (!setor) {
    throw new AppError('Setor não encontrado', 404, 'SETOR_NOT_FOUND');
  }

  res.json(setor);
});

router.get('/setores/:slug/fluxo', (req, res) => {
  const setor = appStore.setores.find((item) => item.slug === req.params.slug && item.ativo);
  if (!setor) {
    throw new AppError('Setor não encontrado', 404, 'SETOR_NOT_FOUND');
  }

  const fluxo = appStore.perguntas
    .filter((pergunta) => pergunta.ativo && (pergunta.setor_id === setor.id || pergunta.geral))
    .sort((a, b) => {
      if (a.geral && !b.geral) return 1;
      if (!a.geral && b.geral) return -1;
      return a.ordem - b.ordem;
    })
    .map((pergunta, index) => ({
      id: pergunta.id,
      texto: pergunta.texto,
      tipo: pergunta.tipo,
      geral: pergunta.geral,
      ordem: pergunta.ordem,
      numero: index + 1,
      url: `/pesquisa/${setor.slug}/pergunta/${index + 1}`,
      opcoes: appStore.opcoesResposta.filter((opcao) => opcao.pergunta_id === pergunta.id),
    }));

  res.json({ setor, fluxo });
});

router.get('/setores/:slug/perguntas/:n', (req, res) => {
  const setor = appStore.setores.find((item) => item.slug === req.params.slug && item.ativo);
  if (!setor) {
    throw new AppError('Setor não encontrado', 404, 'SETOR_NOT_FOUND');
  }

  const fluxo = appStore.perguntas
    .filter((pergunta) => pergunta.ativo && (pergunta.setor_id === setor.id || pergunta.geral))
    .sort((a, b) => {
      if (a.geral && !b.geral) return 1;
      if (!a.geral && b.geral) return -1;
      return a.ordem - b.ordem;
    });

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
});

router.post('/pesquisas', (req, res) => {
  const payload = createPesquisaSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ erro: 'Dados inválidos', codigo: 'VALIDATION_ERROR', detalhes: payload.error.flatten() });
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
});

router.put('/pesquisas/:id/respostas/:perguntaId', (req, res) => {
  const pesquisa = getPesquisaById(Number(req.params.id));
  if (!pesquisa) {
    throw new AppError('Pesquisa não encontrada', 404, 'PESQUISA_NOT_FOUND');
  }

  const pergunta = appStore.perguntas.find((item) => item.id === Number(req.params.perguntaId));
  if (!pergunta) {
    throw new AppError('Pergunta não encontrada', 404, 'PERGUNTA_NOT_FOUND');
  }

  const payload = respostaSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ erro: 'Dados inválidos', codigo: 'VALIDATION_ERROR', detalhes: payload.error.flatten() });
  }

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

  const totalPerguntas = appStore.perguntas.filter((item) => item.ativo && (item.setor_id === pesquisa.setor_id || item.geral)).length;
  const proximaPergunta = totalPerguntas > 0 ? `/pesquisa/${appStore.setores.find((setor) => setor.id === pesquisa.setor_id)?.slug ?? 'setor'}/pergunta/${Math.min(totalPerguntas, totalPerguntas)}` : null;

  return res.json({
    ok: true,
    proximaPergunta,
    mediaParcial: pesquisa.media_parcial,
    ultima: pergunta.geral,
  });
});

router.post('/pesquisas/:id/finalizar', (req, res) => {
  const pesquisa = getPesquisaById(Number(req.params.id));
  if (!pesquisa) {
    throw new AppError('Pesquisa não encontrada', 404, 'PESQUISA_NOT_FOUND');
  }

  if (pesquisa.nps_nota === null || pesquisa.nps_nota === undefined) {
    return res.status(422).json({ erro: 'NPS obrigatório antes de finalizar', codigo: 'NPS_REQUIRED' });
  }

  pesquisa.status = 'concluida';
  pesquisa.ultima_atividade = new Date().toISOString();

  const limiarNps = appStore.configuracoes.find((item) => item.chave === 'limiar_nps_baixo')?.valor?.valor ?? 6;
  const limiarMedia = appStore.configuracoes.find((item) => item.chave === 'limiar_media_baixa')?.valor?.valor ?? 2;
  const encaminharOuvidoria = pesquisa.nps_nota <= Number(limiarNps) || (pesquisa.media_parcial ?? 0) <= Number(limiarMedia);

  return res.json({
    destino: encaminharOuvidoria ? 'ouvidoria' : 'agradecimento',
    motivo: encaminharOuvidoria ? 'nps_baixo_ou_media_baixa' : 'satisfacao_aceitavel',
  });
});

router.post('/pesquisas/:id/paciente', (req, res) => {
  const pesquisa = getPesquisaById(Number(req.params.id));
  if (!pesquisa) {
    throw new AppError('Pesquisa não encontrada', 404, 'PESQUISA_NOT_FOUND');
  }
  const payload = pacienteSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ erro: 'Dados inválidos', codigo: 'VALIDATION_ERROR', detalhes: payload.error.flatten() });
  }
  if (pesquisa.anonimo || !payload.data.consentimento) {
    return res.status(400).json({ erro: 'Somente com consentimento explícito e não anônimo', codigo: 'CONSENTIMENTO_INVALIDO' });
  }

  appStore.pacientes.push({
    id: appStore.pacientes.length + 1,
    ...payload.data,
    criado_em: new Date().toISOString(),
  });

  return res.status(201).json({ ok: true });
});

router.post('/pesquisas/:id/manifestacoes', (req, res) => {
  const pesquisa = getPesquisaById(Number(req.params.id));
  if (!pesquisa) {
    throw new AppError('Pesquisa não encontrada', 404, 'PESQUISA_NOT_FOUND');
  }

  const schema = z.object({
    tipo: z.enum(['elogio', 'reclamacao', 'sugestao']),
    descricao: z.string().min(5),
    anonimo: z.boolean().optional().default(false),
    canal_contato: z.string().optional(),
  });

  const payload = schema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ erro: 'Dados inválidos', codigo: 'VALIDATION_ERROR', detalhes: payload.error.flatten() });
  }

  const manifestacao = {
    id: appStore.manifestacoes.length + 1,
    pesquisa_id: pesquisa.id,
    tipo: payload.data.tipo,
    descricao: payload.data.descricao,
    status: 'aberta',
    data: new Date().toISOString(),
    anonimo: payload.data.anonimo,
    origem: 'pesquisa',
    media_origem: pesquisa.media_parcial,
    motivo_encaminhamento: null,
    canal_contato: payload.data.anonimo ? null : payload.data.canal_contato ?? null,
    parecer_interno: null,
  };

  appStore.manifestacoes.push(manifestacao);
  return res.status(201).json(manifestacao);
});

export default router;
