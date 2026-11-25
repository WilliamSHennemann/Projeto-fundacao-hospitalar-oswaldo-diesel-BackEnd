import request from 'supertest';
import { describe, expect, it } from 'vitest';
import app from '../../app.js';
import { appStore } from '../../shared/store.js';

describe('public survey endpoints', () => {
  it('lists active sectors', async () => {
    const response = await request(app).get('/api/setores');
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThan(0);
  });

  it('creates a survey and blocks finalization without nps', async () => {
    const create = await request(app).post('/api/pesquisas').send({ setor_id: 1, anonimo: false, consentimento: true, data_atendimento: '2026-10-20' });
    expect(create.status).toBe(201);
    expect(appStore.pesquisas.find((pesquisa) => pesquisa.id === create.body.pesquisa_id)?.data_atendimento).toBe('2026-10-20');

    const result = await request(app).post(`/api/pesquisas/${create.body.pesquisa_id}/finalizar`).set('X-Pesquisa-Token', create.body.token);
    expect(result.status).toBe(422);
    expect(result.body.codigo).toBe('NPS_REQUIRED');
  });

  it('rejects an invalid attendance date', async () => {
    const response = await request(app).post('/api/pesquisas').send({ setor_id: 1, data_atendimento: '2026-02-30' });
    expect(response.status).toBe(400);
    expect(response.body.codigo).toBe('VALIDATION_ERROR');
  });

  it('accepts a valid nps response and finalizes the survey successfully', async () => {
    const create = await request(app).post('/api/pesquisas').send({ setor_id: 1, anonimo: false, consentimento: true });
    expect(create.status).toBe(201);

    const npsAnswer = await request(app)
      .put(`/api/pesquisas/${create.body.pesquisa_id}/respostas/7`)
      .set('X-Pesquisa-Token', create.body.token)
      .send({ valor: 9, pergunta_id: 7 });

    expect(npsAnswer.status).toBe(200);
    expect(npsAnswer.body.ok).toBe(true);

    const finalize = await request(app).post(`/api/pesquisas/${create.body.pesquisa_id}/finalizar`).set('X-Pesquisa-Token', create.body.token);
    expect(finalize.status).toBe(200);
    expect(finalize.body.destino).toBe('agradecimento');
    expect(finalize.body.motivo).toBe('nps_adequado');
  });

  it('requires the survey token and routes only by NPS even when the partial average is low', async () => {
    const create = await request(app).post('/api/pesquisas').send({ setor_id: 1, anonimo: true, consentimento: false });
    const noToken = await request(app).post(`/api/pesquisas/${create.body.pesquisa_id}/finalizar`);
    expect(noToken.status).toBe(401);
    const wrongToken = await request(app).post(`/api/pesquisas/${create.body.pesquisa_id}/finalizar`).set('X-Pesquisa-Token', 'other');
    expect(wrongToken.status).toBe(403);
    const otherSurvey = await request(app).post('/api/pesquisas').send({ setor_id: 1, anonimo: true });
    const anotherSurveyToken = await request(app).post(`/api/pesquisas/${create.body.pesquisa_id}/finalizar`).set('X-Pesquisa-Token', otherSurvey.body.token);
    expect(anotherSurveyToken.status).toBe(403);
    const answer = await request(app).put(`/api/pesquisas/${create.body.pesquisa_id}/respostas/7`).set('X-Pesquisa-Token', create.body.token).send({ valor: 8, pergunta_id: 7 });
    expect(answer.status).toBe(200);
    const finalized = await request(app).post(`/api/pesquisas/${create.body.pesquisa_id}/finalizar`).set('X-Pesquisa-Token', create.body.token);
    expect(finalized.body).toEqual({ destino: 'agradecimento', motivo: 'nps_adequado' });
  });

  it('allows an anonymous survey to provide contact details only with consent', async () => {
    const create = await request(app).post('/api/pesquisas').send({ setor_id: 1, anonimo: true, consentimento: false });
    const denied = await request(app).post(`/api/pesquisas/${create.body.pesquisa_id}/paciente`).set('X-Pesquisa-Token', create.body.token).send({ telefone: '51999999999', consentimento: false });
    expect(denied.status).toBe(400);
    const accepted = await request(app).post(`/api/pesquisas/${create.body.pesquisa_id}/paciente`).set('X-Pesquisa-Token', create.body.token).send({ telefone: '51999999999', consentimento: true });
    expect(accepted.status).toBe(201);
    expect(accepted.body).toEqual({ ok: true });
  });

  it('routes low NPS to Ouvidoria and ignores low partial averages for adequate NPS', async () => {
    const lowNpsSurvey = await request(app).post('/api/pesquisas').send({ setor_id: 1, anonimo: true });
    await request(app).put(`/api/pesquisas/${lowNpsSurvey.body.pesquisa_id}/respostas/7`).set('X-Pesquisa-Token', lowNpsSurvey.body.token).send({ valor: 5, pergunta_id: 7 });
    const lowNps = await request(app).post(`/api/pesquisas/${lowNpsSurvey.body.pesquisa_id}/finalizar`).set('X-Pesquisa-Token', lowNpsSurvey.body.token);
    expect(lowNps.body).toEqual({ destino: 'ouvidoria', motivo: 'nps_baixo' });

    const lowAverageSurvey = await request(app).post('/api/pesquisas').send({ setor_id: 1, anonimo: true });
    await request(app).put(`/api/pesquisas/${lowAverageSurvey.body.pesquisa_id}/respostas/1`).set('X-Pesquisa-Token', lowAverageSurvey.body.token).send({ valor: 1, pergunta_id: 1 });
    await request(app).put(`/api/pesquisas/${lowAverageSurvey.body.pesquisa_id}/respostas/7`).set('X-Pesquisa-Token', lowAverageSurvey.body.token).send({ valor: 8, pergunta_id: 7 });
    const adequateNps = await request(app).post(`/api/pesquisas/${lowAverageSurvey.body.pesquisa_id}/finalizar`).set('X-Pesquisa-Token', lowAverageSurvey.body.token);
    expect(adequateNps.body).toEqual({ destino: 'agradecimento', motivo: 'nps_adequado' });
  });

  it('registers complaint and contact together, then rejects invalid or excessive manifestations', async () => {
    const create = await request(app).post('/api/pesquisas').send({ setor_id: 1, anonimo: true });
    const headers = { 'X-Pesquisa-Token': create.body.token };
    const invalidConsent = await request(app).post(`/api/pesquisas/${create.body.pesquisa_id}/manifestacoes`).set(headers).send({
      tipo: 'reclamacao',
      descricao: 'Preciso falar com a Ouvidoria',
      contato: { nome: 'Maria', telefone: '51999999999', consentimento: false },
    });
    expect(invalidConsent.status).toBe(400);

    const invalidPhone = await request(app).post(`/api/pesquisas/${create.body.pesquisa_id}/manifestacoes`).set(headers).send({
      tipo: 'reclamacao',
      descricao: 'Preciso falar com a Ouvidoria',
      contato: { telefone: '123', consentimento: true },
    });
    expect(invalidPhone.status).toBe(400);

    for (let index = 0; index < 3; index += 1) {
      const sent = await request(app).post(`/api/pesquisas/${create.body.pesquisa_id}/manifestacoes`).set(headers).send(
        index === 0
          ? { tipo: 'reclamacao', descricao: 'Preciso falar com a Ouvidoria', contato: { nome: 'Maria', telefone: '5511999999999', consentimento: true } }
          : { tipo: 'elogio', descricao: 'Atendimento muito bom' },
      );
      expect(sent.status).toBe(201);
    }
    const fourth = await request(app).post(`/api/pesquisas/${create.body.pesquisa_id}/manifestacoes`).set(headers).send({ tipo: 'sugestao', descricao: 'Outra sugestão' });
    expect(fourth.status).toBe(409);
    expect(fourth.body.codigo).toBe('MANIFESTACAO_LIMITE');
  });

  it('rejects invalid response types and allows the next response only after validation', async () => {
    const create = await request(app).post('/api/pesquisas').send({ setor_id: 1, anonimo: true });
    const headers = { 'X-Pesquisa-Token': create.body.token };
    const invalidFace = await request(app).put(`/api/pesquisas/${create.body.pesquisa_id}/respostas/1`).set(headers).send({ valor: 9, pergunta_id: 1 });
    expect(invalidFace.status).toBe(400);
    expect(invalidFace.body.codigo).toBe('RESPOSTA_INVALIDA');
  });

  it('abandona, lista progresso e reabre uma pesquisa parcial', async () => {
    const create = await request(app).post('/api/pesquisas').send({ setor_id: 1, anonimo: true });
    const headers = { 'X-Pesquisa-Token': create.body.token };
    await request(app).put(`/api/pesquisas/${create.body.pesquisa_id}/respostas/1`).set(headers).send({ valor: 5, pergunta_id: 1 });

    const abandon = await request(app).post(`/api/pesquisas/${create.body.pesquisa_id}/abandonar`).set(headers);
    expect(abandon.status).toBe(200);
    expect(abandon.body).toEqual({ ok: true, status: 'parcial' });

    const progress = await request(app).get(`/api/pesquisas/${create.body.pesquisa_id}/progresso`).set(headers);
    expect(progress.status).toBe(200);
    expect(progress.body.status).toBe('parcial');
    expect(progress.body.respondidas).toContain(1);

    const reanswer = await request(app).put(`/api/pesquisas/${create.body.pesquisa_id}/respostas/7`).set(headers).send({ valor: 10, pergunta_id: 7 });
    expect(reanswer.status).toBe(200);
    expect(appStore.pesquisas.find((item) => item.id === create.body.pesquisa_id).status).toBe('em_andamento');

    await request(app).post(`/api/pesquisas/${create.body.pesquisa_id}/finalizar`).set(headers);
    const abandonFinished = await request(app).post(`/api/pesquisas/${create.body.pesquisa_id}/abandonar`).set(headers);
    expect(abandonFinished.body.status).toBe('concluida');
  });
});
