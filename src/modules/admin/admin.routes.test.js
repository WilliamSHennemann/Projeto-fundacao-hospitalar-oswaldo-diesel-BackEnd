import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import app from '../../app.js';
import { appStore } from '../../shared/store.js';

let createdQuestionId;
let temporaryUserId;
let createdSectorId;
let createdSurveyId;

afterEach(() => {
  const firstQuestion = appStore.perguntas.find((item) => item.id === 1);
  if (firstQuestion) firstQuestion.ordem = 1;
  if (createdQuestionId) {
    appStore.perguntas = appStore.perguntas.filter((item) => item.id !== createdQuestionId);
    appStore.opcoesResposta = appStore.opcoesResposta.filter((item) => item.pergunta_id !== createdQuestionId);
  }
  if (temporaryUserId) appStore.usuarios = appStore.usuarios.filter((item) => item.id !== temporaryUserId);
  if (createdSectorId) appStore.setores = appStore.setores.filter((item) => item.id !== createdSectorId);
  if (createdSurveyId) {
    appStore.pesquisas = appStore.pesquisas.filter((item) => item.id !== createdSurveyId);
    appStore.respostas = appStore.respostas.filter((item) => item.pesquisa_id !== createdSurveyId);
  }
  createdQuestionId = undefined;
  temporaryUserId = undefined;
  createdSectorId = undefined;
  createdSurveyId = undefined;
});

describe('admin question management', () => {
  it('creates a new sector with a slug-based public URL', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: 'super@fundacao.com', senha: 'super123' });
    const response = await request(app).post('/api/admin/setores').set('Authorization', `Bearer ${login.body.token}`).send({ nome: 'Centro de Tomografia' });
    expect(response.status).toBe(201);
    createdSectorId = response.body.id;
    expect(response.body.slug).toBe('centro-de-tomografia');
    expect(response.body.url).toBe('/centro-de-tomografia');
  });

  it('creates, lists, edits, reorders and logically deletes a question', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: 'super@fundacao.com', senha: 'super123' });
    const auth = { Authorization: `Bearer ${login.body.token}` };
    const create = await request(app).post('/api/admin/perguntas').set(auth).send({
      setor_id: 1, texto: 'Como avalia a limpeza?', tipo: 'rostinho', ordem: 10,
      obrigatoria: false, ativo: true,
      opcoes: [
        { valor: 1, rotulo: 'Muito ruim' }, { valor: 2, rotulo: 'Ruim' }, { valor: 3, rotulo: 'Neutro' },
        { valor: 4, rotulo: 'Bom' }, { valor: 5, rotulo: 'Muito bom' },
      ],
    });
    expect(create.status).toBe(201);
    createdQuestionId = create.body.id;
    expect(create.body.opcoes).toHaveLength(5);

    const listed = await request(app).get('/api/admin/perguntas').set(auth);
    expect(listed.body.some((item) => item.id === createdQuestionId)).toBe(true);
    const edited = await request(app).put(`/api/admin/perguntas/${createdQuestionId}`).set(auth).send({
      setor_id: 1, texto: 'Como avalia a limpeza do setor?', tipo: 'rostinho', ordem: 10,
      obrigatoria: false, ativo: true,
      opcoes: [
        { valor: 1, rotulo: 'Muito ruim' }, { valor: 2, rotulo: 'Ruim' }, { valor: 3, rotulo: 'Neutro' },
        { valor: 4, rotulo: 'Bom' }, { valor: 5, rotulo: 'Muito bom' },
      ],
    });
    expect(edited.body.texto).toBe('Como avalia a limpeza do setor?');

    const reordered = await request(app).patch('/api/admin/perguntas/reordenar').set(auth).send({ perguntas: [{ id: 1, ordem: 10 }, { id: createdQuestionId, ordem: 1 }] });
    expect(reordered.body.ok).toBe(true);
    expect(appStore.perguntas.find((item) => item.id === 1).ordem).toBe(10);
    expect(appStore.perguntas.find((item) => item.id === createdQuestionId).ordem).toBe(1);

    const deleted = await request(app).delete(`/api/admin/perguntas/${createdQuestionId}`).set(auth);
    expect(deleted.body.ativo).toBe(false);
    expect(appStore.perguntas.some((item) => item.id === createdQuestionId)).toBe(true);
  });

  it('rejects a duplicate active NPS general question', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: 'super@fundacao.com', senha: 'super123' });
    const response = await request(app).post('/api/admin/perguntas').set('Authorization', `Bearer ${login.body.token}`).send({
      texto: 'NPS repetido?', tipo: 'nps', geral: true, ordem: 999, obrigatoria: true, ativo: true,
    });
    expect(response.status).toBe(409);
    expect(response.body.codigo).toBe('NPS_EXISTS');
  });

  it('shares a common question across sectors and restricts its management to super admins', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: 'super@fundacao.com', senha: 'super123' });
    const auth = { Authorization: `Bearer ${login.body.token}` };
    const created = await request(app).post('/api/admin/perguntas').set(auth).send({
      setor_id: null,
      todos_setores: true,
      texto: 'Como foi a limpeza do hospital?',
      tipo: 'texto',
      ordem: 1,
      obrigatoria: false,
    });
    expect(created.status).toBe(201);
    createdQuestionId = created.body.id;
    expect(created.body.todos_setores).toBe(true);

    const receptionFlow = await request(app).get('/api/setores/recepcao/fluxo');
    const triageFlow = await request(app).get('/api/setores/triagem/fluxo');
    expect(receptionFlow.body.fluxo.some((question) => question.id === createdQuestionId)).toBe(true);
    expect(triageFlow.body.fluxo.some((question) => question.id === createdQuestionId)).toBe(true);

    temporaryUserId = Math.max(0, ...appStore.usuarios.map((item) => item.id)) + 1;
    appStore.usuarios.push({
      id: temporaryUserId,
      nome: 'Gestão Recepção',
      email: 'gestao@test.local',
      perfil_id: 3,
      perfil: 'gestao',
      setor_id: 1,
      permissoes: ['gestao'],
      ativo: true,
    });
    const { issueToken } = await import('../auth/auth.routes.js');
    const managementToken = issueToken({
      id: temporaryUserId,
      email: 'gestao@test.local',
      perfil: 'gestao',
      permissoes: ['gestao'],
      setor_id: 1,
    });
    const managementAuth = { Authorization: `Bearer ${managementToken}` };
    const questions = await request(app).get('/api/admin/perguntas').set(managementAuth);
    expect(questions.body.some((question) => question.id === createdQuestionId)).toBe(true);
    const deniedEdit = await request(app).put(`/api/admin/perguntas/${createdQuestionId}`).set(managementAuth).send({
      setor_id: null,
      todos_setores: true,
      texto: 'Edição não permitida',
      tipo: 'texto',
      ordem: 1,
      obrigatoria: false,
    });
    expect(deniedEdit.status).toBe(403);

    const survey = await request(app).post('/api/pesquisas').send({ setor_id: 2, anonimo: true });
    createdSurveyId = survey.body.pesquisa_id;
    const answer = await request(app)
      .put(`/api/pesquisas/${createdSurveyId}/respostas/${createdQuestionId}`)
      .set('X-Pesquisa-Token', survey.body.token)
      .send({ pergunta_id: createdQuestionId, texto: 'Boa' });
    expect(answer.status).toBe(200);
  });

  it('limits an admin_setor to questions in the assigned sector', async () => {
    temporaryUserId = Math.max(0, ...appStore.usuarios.map((item) => item.id)) + 1;
    appStore.usuarios.push({ id: temporaryUserId, nome: 'Admin Setor', email: 'setor@test.local', perfil_id: 2, perfil: 'admin_setor', setor_id: 1, permissoes: ['admin_setor'], ativo: true });
    const { issueToken } = await import('../auth/auth.routes.js');
    const token = issueToken({ id: temporaryUserId, email: 'setor@test.local', perfil: 'admin_setor', permissoes: ['admin_setor'], setor_id: 1 });
    const auth = { Authorization: `Bearer ${token}` };
    const list = await request(app).get('/api/admin/perguntas').set(auth);
    expect(list.status).toBe(200);
    expect(list.body.every((question) => question.setor_id === 1)).toBe(true);
    const denied = await request(app).post('/api/admin/perguntas').set(auth).send({ setor_id: 2, texto: 'Pergunta sem acesso', tipo: 'texto', ordem: 20, obrigatoria: false });
    expect(denied.status).toBe(403);
    expect(denied.body.codigo).toBe('FORBIDDEN');
    const deniedMove = await request(app).put('/api/admin/perguntas/2').set(auth).send({
      setor_id: 1,
      texto: 'Tentativa de mover pergunta de outro setor',
      tipo: 'rostinho',
      ordem: 2,
      obrigatoria: false,
      opcoes: [
        { valor: 1, rotulo: 'Muito ruim' }, { valor: 2, rotulo: 'Ruim' }, { valor: 3, rotulo: 'Neutro' },
        { valor: 4, rotulo: 'Bom' }, { valor: 5, rotulo: 'Muito bom' },
      ],
    });
    expect(deniedMove.status).toBe(403);
    const deniedNpsEdit = await request(app).put('/api/admin/perguntas/7').set(auth).send({
      setor_id: 1,
      geral: false,
      texto: 'Tentativa de editar o NPS global',
      tipo: 'rostinho',
      ordem: 2,
      obrigatoria: false,
      opcoes: [
        { valor: 1, rotulo: 'Muito ruim' }, { valor: 2, rotulo: 'Ruim' }, { valor: 3, rotulo: 'Neutro' },
        { valor: 4, rotulo: 'Bom' }, { valor: 5, rotulo: 'Muito bom' },
      ],
    });
    expect(deniedNpsEdit.status).toBe(403);
  });
});
