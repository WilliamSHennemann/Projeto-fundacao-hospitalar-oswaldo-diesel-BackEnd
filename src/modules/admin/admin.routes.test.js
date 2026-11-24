import request from 'supertest';
import bcrypt from 'bcryptjs';
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
  it('creates a management user linked to a sector regardless of the requested profile', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: 'super@fundacao.com', senha: 'super123' });
    const response = await request(app)
      .post('/api/admin/usuarios')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({
        nome: 'Gestora da Recepção',
        email: 'gestora@fundacao.com',
        senha: 'gestora123',
        perfil: 'super_admin',
        setor_id: 1,
      });

    expect(response.status).toBe(201);
    temporaryUserId = response.body.id;
    expect(response.body).toEqual({
      id: temporaryUserId,
      nome: 'Gestora da Recepção',
      email: 'gestora@fundacao.com',
      perfil: 'gestao',
      permissoes: ['dashboard', 'exportacoes', 'perguntas'],
      setor_id: 1,
    });
    const storedUser = appStore.usuarios.find((user) => user.id === temporaryUserId);
    expect(storedUser.perfil).toBe('gestao');
    expect(storedUser.senha_hash).not.toBe('gestora123');
    expect(await bcrypt.compare('gestora123', storedUser.senha_hash)).toBe(true);

    const loginManager = await request(app).post('/api/auth/login').send({ email: 'gestora@fundacao.com', senha: 'gestora123' });
    expect(loginManager.status).toBe(200);
    expect(loginManager.body.usuario).toMatchObject({ perfil: 'gestao', setor_id: 1 });
    expect(loginManager.body.usuario).not.toHaveProperty('senha');
    const managerAuth = { Authorization: `Bearer ${loginManager.body.token}` };

    const questions = await request(app).get('/api/admin/perguntas').set(managerAuth);
    expect(questions.status).toBe(200);
    expect(questions.body.every((question) => question.setor_id === 1)).toBe(true);

    const deniedCreate = await request(app)
      .post('/api/admin/perguntas')
      .set(managerAuth)
      .send({ setor_id: 2, texto: 'Pergunta de outro setor', tipo: 'texto', ordem: 10, obrigatoria: false });
    expect(deniedCreate.status).toBe(403);

    const deniedEdit = await request(app).put('/api/admin/perguntas/2').set(managerAuth).send({ setor_id: 1 });
    expect(deniedEdit.status).toBe(403);
    const deniedDelete = await request(app).delete('/api/admin/perguntas/2').set(managerAuth);
    expect(deniedDelete.status).toBe(403);
    const deniedReorder = await request(app)
      .patch('/api/admin/perguntas/reordenar')
      .set(managerAuth)
      .send({ perguntas: [{ id: 2, ordem: 1 }] });
    expect(deniedReorder.status).toBe(403);

    const deniedSectorAdmin = await request(app).get('/api/admin/setores').set(managerAuth);
    const deniedUserAdmin = await request(app).get('/api/admin/usuarios').set(managerAuth);
    expect(deniedSectorAdmin.status).toBe(403);
    expect(deniedUserAdmin.status).toBe(403);

    storedUser.ativo = false;
    try {
      const disabledLogin = await request(app)
        .post('/api/auth/login')
        .send({ email: 'gestora@fundacao.com', senha: 'gestora123' });
      expect(disabledLogin.status).toBe(401);
    } finally {
      storedUser.ativo = true;
    }

    const duplicate = await request(app)
      .post('/api/admin/usuarios')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({ nome: 'Outra Gestora', email: 'GESTORA@FUNDACAO.COM', senha: 'outrasenha123', setor_id: 1 });
    expect(duplicate.status).toBe(409);

    const invalidPassword = await request(app)
      .post('/api/admin/usuarios')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({ nome: 'Senha Curta', email: 'curta@fundacao.com', senha: '1234567', setor_id: 1 });
    expect(invalidPassword.status).toBe(400);
  });

  it('denies gestor creation to non-super-admin profiles and rejects inactive sectors', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: 'ouvidoria@fundacao.com', senha: 'ouvidoria123' });
    const denied = await request(app)
      .post('/api/admin/usuarios')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({ nome: 'Gestora', email: 'negada@fundacao.com', senha: 'senha12345', setor_id: 1 });
    expect(denied.status).toBe(403);

    const superLogin = await request(app).post('/api/auth/login').send({ email: 'super@fundacao.com', senha: 'super123' });
    const inactiveSector = appStore.setores.find((sector) => sector.id === 6);
    const originalActive = inactiveSector.ativo;
    inactiveSector.ativo = false;
    try {
      const response = await request(app)
        .post('/api/admin/usuarios')
        .set('Authorization', `Bearer ${superLogin.body.token}`)
        .send({ nome: 'Setor Inativo', email: 'inativo@fundacao.com', senha: 'senha12345', setor_id: 6 });
      expect(response.status).toBe(404);
    } finally {
      inactiveSector.ativo = originalActive;
    }
  });

  it('creates a new sector with a slug-based public URL', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: 'super@fundacao.com', senha: 'super123' });
    const response = await request(app).post('/api/admin/setores').set('Authorization', `Bearer ${login.body.token}`).send({ nome: 'Centro de Tomografia' });
    expect(response.status).toBe(201);
    createdSectorId = response.body.id;
    expect(response.body.slug).toBe('centro-de-tomografia');
    expect(response.body.url).toBe('/centro-de-tomografia');
  });

  it('assigns the next sector order when creating a question without ordem', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: 'super@fundacao.com', senha: 'super123' });
    const response = await request(app).post('/api/admin/perguntas').set('Authorization', `Bearer ${login.body.token}`).send({
      setor_id: 1, texto: 'Como avalia o conforto?', tipo: 'texto', obrigatoria: false,
    });
    expect(response.status).toBe(201);
    createdQuestionId = response.body.id;
    expect(response.body.ordem).toBe(2);
  });

  it('updates a sector and logically deletes it without changing its URL when only the name changes', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: 'super@fundacao.com', senha: 'super123' });
    const auth = { Authorization: `Bearer ${login.body.token}` };
    const created = await request(app).post('/api/admin/setores').set(auth).send({ nome: 'Centro de Tomografia' });
    createdSectorId = created.body.id;

    const renamed = await request(app).patch(`/api/admin/setores/${createdSectorId}`).set(auth).send({ nome: 'Tomografia' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.nome).toBe('Tomografia');
    expect(renamed.body.slug).toBe('centro-de-tomografia');
    expect(renamed.body.url).toBe('/centro-de-tomografia');

    const reSlugged = await request(app).patch(`/api/admin/setores/${createdSectorId}`).set(auth).send({ slug: 'tomografia-principal' });
    expect(reSlugged.status).toBe(200);
    expect(reSlugged.body.url).toBe('/tomografia-principal');

    const deleted = await request(app).delete(`/api/admin/setores/${createdSectorId}`).set(auth);
    expect(deleted.status).toBe(200);
    expect(deleted.body.ativo).toBe(false);
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
    expect(questions.body.some((question) => question.id === createdQuestionId)).toBe(false);
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
