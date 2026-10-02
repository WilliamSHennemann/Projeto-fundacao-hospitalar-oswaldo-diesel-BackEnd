import request from 'supertest';
import { describe, expect, it } from 'vitest';
import app from '../../app.js';

describe('public survey endpoints', () => {
  it('lists active sectors', async () => {
    const response = await request(app).get('/api/setores');
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThan(0);
  });

  it('creates a survey and blocks finalization without nps', async () => {
    const create = await request(app).post('/api/pesquisas').send({ setor_id: 1, anonimo: false, consentimento: true });
    expect(create.status).toBe(201);

    const result = await request(app).post(`/api/pesquisas/${create.body.pesquisa_id}/finalizar`);
    expect(result.status).toBe(422);
    expect(result.body.codigo).toBe('NPS_REQUIRED');
  });

  it('accepts a valid nps response and finalizes the survey successfully', async () => {
    const create = await request(app).post('/api/pesquisas').send({ setor_id: 1, anonimo: false, consentimento: true });
    expect(create.status).toBe(201);

    const npsAnswer = await request(app)
      .put(`/api/pesquisas/${create.body.pesquisa_id}/respostas/7`)
      .send({ valor: 9, pergunta_id: 7 });

    expect(npsAnswer.status).toBe(200);
    expect(npsAnswer.body.ok).toBe(true);

    const finalize = await request(app).post(`/api/pesquisas/${create.body.pesquisa_id}/finalizar`);
    expect(finalize.status).toBe(200);
    expect(finalize.body.destino).toBe('agradecimento');
  });
});
