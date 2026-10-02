import request from 'supertest';
import { describe, expect, it } from 'vitest';
import app from '../../app.js';

describe('jobs', () => {
  it('returns abandonment metrics for the monitoring job', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'super@fundacao.com', senha: 'super123' });

    const response = await request(app)
      .get('/api/jobs/abandono')
      .set('Authorization', `Bearer ${login.body.token}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('total');
    expect(response.body).toHaveProperty('limite_minutos');
  });

  it('returns retention metrics for the monitoring job', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'super@fundacao.com', senha: 'super123' });

    const response = await request(app)
      .get('/api/jobs/retencao')
      .set('Authorization', `Bearer ${login.body.token}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('taxa_retencao');
    expect(response.body).toHaveProperty('dias_alvo');
  });
});
