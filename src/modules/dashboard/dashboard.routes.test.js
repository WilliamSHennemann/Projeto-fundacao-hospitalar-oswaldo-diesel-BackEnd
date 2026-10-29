import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import app from '../../app.js';
import { appStore } from '../../shared/store.js';

let insertedSurveyId;
let temporaryUserId;

afterEach(() => {
  if (insertedSurveyId) appStore.pesquisas = appStore.pesquisas.filter((item) => item.id !== insertedSurveyId);
  if (temporaryUserId) appStore.usuarios = appStore.usuarios.filter((item) => item.id !== temporaryUserId);
  insertedSurveyId = undefined;
  temporaryUserId = undefined;
});

describe('dashboard filters and permissions', () => {
  it('applies date and sector filters to summary, sectors, shifts and in-progress surveys', async () => {
    const created = await request(app).post('/api/pesquisas').send({ setor_id: 1, anonimo: true });
    insertedSurveyId = created.body.pesquisa_id;
    const survey = appStore.pesquisas.find((item) => item.id === insertedSurveyId);
    survey.data_hora = '2020-06-15T12:00:00.000Z';
    const login = await request(app).post('/api/auth/login').send({ email: 'super@fundacao.com', senha: 'super123' });
    const auth = { Authorization: `Bearer ${login.body.token}` };
    const query = '?inicio=2020-06-15&fim=2020-06-15&setor_id=1';

    const summary = await request(app).get(`/api/dashboard/resumo${query}`).set(auth);
    expect(summary.status).toBe(200);
    expect(summary.body.total_pesquisas).toBe(1);
    const sectors = await request(app).get(`/api/dashboard/setores${query}`).set(auth);
    expect(sectors.body).toHaveLength(1);
    expect(sectors.body[0].setor_id).toBe(1);
    const shifts = await request(app).get(`/api/dashboard/setores/1/turnos?inicio=2020-06-15&fim=2020-06-15`).set(auth);
    expect(shifts.body.find((item) => item.turno === 'manha').total).toBe(0);
    const inProgress = await request(app).get(`/api/dashboard/em-andamento${query}`).set(auth);
    expect(inProgress.body.map((item) => item.id)).toContain(insertedSurveyId);
  });

  it('rejects invalid date ranges', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: 'super@fundacao.com', senha: 'super123' });
    const response = await request(app).get('/api/dashboard/resumo?inicio=2026-12-01&fim=2026-01-01').set('Authorization', `Bearer ${login.body.token}`);
    expect(response.status).toBe(400);
    expect(response.body.codigo).toBe('VALIDATION_ERROR');
  });

  it('allows a visualizer to see the dashboard but denies question administration', async () => {
    temporaryUserId = Math.max(0, ...appStore.usuarios.map((item) => item.id)) + 1;
    appStore.usuarios.push({ id: temporaryUserId, nome: 'Viewer', email: 'viewer@test.local', perfil_id: 5, perfil: 'visualizador', setor_id: null, permissoes: ['visualizador'], ativo: true });
    const { issueToken } = await import('../auth/auth.routes.js');
    const token = issueToken({ id: temporaryUserId, email: 'viewer@test.local', perfil: 'visualizador', permissoes: ['visualizador'] });
    const dashboard = await request(app).get('/api/dashboard/resumo').set('Authorization', `Bearer ${token}`);
    expect(dashboard.status).toBe(200);
    const admin = await request(app).get('/api/admin/perguntas').set('Authorization', `Bearer ${token}`);
    expect(admin.status).toBe(403);
  });

  it('limits management dashboard data to the assigned sector', async () => {
    temporaryUserId = Math.max(0, ...appStore.usuarios.map((item) => item.id)) + 1;
    appStore.usuarios.push({
      id: temporaryUserId,
      nome: 'Gestão Recepção',
      email: 'gestao-dashboard@test.local',
      perfil_id: 3,
      perfil: 'gestao',
      setor_id: 1,
      permissoes: ['gestao'],
      ativo: true,
    });
    const { issueToken } = await import('../auth/auth.routes.js');
    const token = issueToken({
      id: temporaryUserId,
      email: 'gestao-dashboard@test.local',
      perfil: 'gestao',
      permissoes: ['gestao'],
      setor_id: 1,
    });
    const auth = { Authorization: `Bearer ${token}` };

    const sectors = await request(app).get('/api/dashboard/setores').set(auth);
    expect(sectors.status).toBe(200);
    expect(sectors.body.map((sector) => sector.setor_id)).toEqual([1]);

    const otherSector = await request(app).get('/api/dashboard/resumo?setor_id=2').set(auth);
    expect(otherSector.status).toBe(403);
    expect(otherSector.body.codigo).toBe('SECTOR_FORBIDDEN');
    const otherSectorPath = await request(app).get('/api/dashboard/setores/2/turnos?setor_id=1').set(auth);
    expect(otherSectorPath.status).toBe(403);
  });
});
