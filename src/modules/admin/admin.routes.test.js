import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import app from '../../app.js';
import { appStore } from '../../shared/store.js';

let createdQuestionId;
let temporaryUserId;
let createdSectorId;

afterEach(() => {
  const firstQuestion = appStore.perguntas.find((item) => item.id === 1);
  if (firstQuestion) firstQuestion.ordem = 1;
  if (createdQuestionId) {
    appStore.perguntas = appStore.perguntas.filter((item) => item.id !== createdQuestionId);
    appStore.opcoesResposta = appStore.opcoesResposta.filter((item) => item.pergunta_id !== createdQuestionId);
  }
  if (temporaryUserId) appStore.usuarios = appStore.usuarios.filter((item) => item.id !== temporaryUserId);
  if (createdSectorId) appStore.setores = appStore.setores.filter((item) => item.id !== createdSectorId);
  createdQuestionId = undefined;
  temporaryUserId = undefined;
  createdSectorId = undefined;
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
  });
});
