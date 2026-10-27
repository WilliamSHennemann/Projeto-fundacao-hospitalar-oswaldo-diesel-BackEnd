import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import app from '../../app.js';
import { appStore } from '../../shared/store.js';

let surveyId;
let manifestationId;
let anonymousSurveyId;
let anonymousManifestationId;

afterEach(() => {
  if (manifestationId) appStore.manifestacoes = appStore.manifestacoes.filter((item) => item.id !== manifestationId);
  if (anonymousManifestationId) appStore.manifestacoes = appStore.manifestacoes.filter((item) => item.id !== anonymousManifestationId);
  if (surveyId) {
    const survey = appStore.pesquisas.find((item) => item.id === surveyId);
    if (survey?.paciente_id) appStore.pacientes = appStore.pacientes.filter((item) => item.id !== survey.paciente_id);
    appStore.pesquisas = appStore.pesquisas.filter((item) => item.id !== surveyId);
  }
  if (anonymousSurveyId) appStore.pesquisas = appStore.pesquisas.filter((item) => item.id !== anonymousSurveyId);
  surveyId = undefined;
  manifestationId = undefined;
  anonymousSurveyId = undefined;
  anonymousManifestationId = undefined;
});

describe('Ouvidoria context and consent', () => {
  it('shows patient data only after explicit consent and hides contact from public responses', async () => {
    const created = await request(app).post('/api/pesquisas').send({ setor_id: 1, anonimo: true, consentimento: false });
    surveyId = created.body.pesquisa_id;
    await request(app).post(`/api/pesquisas/${surveyId}/paciente`).set('X-Pesquisa-Token', created.body.token).send({ nome: 'Teste de Contato', telefone: '51999999999', consentimento: true });
    const submitted = await request(app).post(`/api/pesquisas/${surveyId}/manifestacoes`).set('X-Pesquisa-Token', created.body.token).send({ tipo: 'reclamacao', descricao: 'Preciso de retorno da Ouvidoria.', anonimo: false, canal_contato: '51999999999' });
    expect(submitted.status).toBe(201);
    expect(submitted.body).not.toHaveProperty('canal_contato');
    manifestationId = submitted.body.id;

    const login = await request(app).post('/api/auth/login').send({ email: 'ouvidoria@fundacao.com', senha: 'ouvidoria123' });
    const headers = { Authorization: `Bearer ${login.body.token}` };
    const list = await request(app).get('/api/manifestacoes').set(headers);
    const item = list.body.find((entry) => entry.id === manifestationId);
    expect(item.setor).toEqual({ id: 1, nome: 'Recepção' });
    expect(item.pesquisa).toMatchObject({ id: surveyId });
    expect(item.paciente).toMatchObject({ nome: 'Teste de Contato', telefone: '51999999999', consentimento: true });

    const detail = await request(app).get(`/api/manifestacoes/${manifestationId}`).set(headers);
    expect(detail.body.paciente.telefone).toBe('51999999999');

    const anonymousSurvey = await request(app).post('/api/pesquisas').send({ setor_id: 1, anonimo: true, consentimento: false });
    anonymousSurveyId = anonymousSurvey.body.pesquisa_id;
    const anonymousSubmission = await request(app).post(`/api/pesquisas/${anonymousSurveyId}/manifestacoes`).set('X-Pesquisa-Token', anonymousSurvey.body.token).send({ tipo: 'reclamacao', descricao: 'Sem consentimento não deve aparecer contato.', anonimo: false, canal_contato: '51888888888' });
    anonymousManifestationId = anonymousSubmission.body.id;
    expect(anonymousSubmission.body).not.toHaveProperty('canal_contato');
    const anonymousDetail = await request(app).get(`/api/manifestacoes/${anonymousManifestationId}`).set(headers);
    expect(anonymousDetail.body.paciente).toBeNull();
    expect(anonymousDetail.body.canal_contato).toBeNull();
  });
});
