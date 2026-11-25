import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import app from '../../app.js';
import { appStore } from '../../shared/store.js';
import { calculateAverage, calculateNps } from '../../shared/metrics.js';
import { issueToken } from '../auth/auth.routes.js';

let temporaryUserId;
let insertedSurveyIds = [];
let insertedManifestationIds = [];

afterEach(() => {
  if (temporaryUserId) appStore.usuarios = appStore.usuarios.filter((user) => user.id !== temporaryUserId);
  appStore.pesquisas = appStore.pesquisas.filter((survey) => !insertedSurveyIds.includes(survey.id));
  appStore.manifestacoes = appStore.manifestacoes.filter((item) => !insertedManifestationIds.includes(item.id));
  temporaryUserId = undefined;
  insertedSurveyIds = [];
  insertedManifestationIds = [];
});

describe('TV Wall sector access', () => {
  it('requires authentication and scopes every aggregate to a manager sector', async () => {
    const surveyIdStart = Math.max(0, ...appStore.pesquisas.map((survey) => survey.id)) + 1;
    insertedSurveyIds = [surveyIdStart, surveyIdStart + 1];
    appStore.pesquisas.push(
      { id: surveyIdStart, setor_id: 1, nps_nota: 10, media_parcial: 5 },
      { id: surveyIdStart + 1, setor_id: 2, nps_nota: 0, media_parcial: 1 },
    );
    const manifestationIdStart = Math.max(0, ...appStore.manifestacoes.map((item) => item.id)) + 1;
    insertedManifestationIds = [manifestationIdStart, manifestationIdStart + 1];
    appStore.manifestacoes.push(
      { id: manifestationIdStart, pesquisa_id: surveyIdStart, tipo: 'elogio' },
      { id: manifestationIdStart + 1, pesquisa_id: surveyIdStart + 1, tipo: 'elogio' },
    );

    temporaryUserId = Math.max(0, ...appStore.usuarios.map((user) => user.id)) + 1;
    appStore.usuarios.push({
      id: temporaryUserId,
      nome: 'Gestão Recepção',
      email: 'gestao-tvwall@test.local',
      perfil_id: 3,
      perfil: 'gestao',
      setor_id: 1,
      permissoes: ['gestao'],
      ativo: true,
    });
    const token = issueToken({
      id: temporaryUserId,
      email: 'gestao-tvwall@test.local',
      perfil: 'gestao',
      permissoes: ['gestao'],
      setor_id: 1,
    });

    const anonymous = await request(app).get('/api/tvwall');
    expect(anonymous.status).toBe(401);

    const response = await request(app).get('/api/tvwall').set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.setores.map((sector) => sector.slug)).toEqual(['recepcao']);
    expect(response.body.nps_geral).toBe(calculateNps([10]));
    expect(response.body.media_geral).toBe(calculateAverage([5]));
    expect(response.body.elogios_gerais).toBe(1);

    const outOfScope = await request(app).get('/api/tvwall?setor_id=2').set('Authorization', `Bearer ${token}`);
    expect(outOfScope.status).toBe(403);
  });
});
