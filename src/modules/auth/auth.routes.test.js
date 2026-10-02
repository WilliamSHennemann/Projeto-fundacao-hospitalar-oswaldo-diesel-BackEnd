import request from 'supertest';
import { describe, expect, it } from 'vitest';
import app from '../../app.js';

describe('auth', () => {
  it('authenticates a user with valid credentials and returns a JWT', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'super@fundacao.com', senha: 'super123' });

    expect(response.status).toBe(200);
    expect(response.body.token).toBeTruthy();
    expect(response.body.usuario.email).toBe('super@fundacao.com');
    expect(response.body.usuario.perfil).toBe('super_admin');
  });

  it('rejects invalid credentials', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'super@fundacao.com', senha: 'senhaerrada' });

    expect(response.status).toBe(401);
    expect(response.body.codigo).toBe('INVALID_CREDENTIALS');
  });

  it('requires an authenticated session for protected routes', async () => {
    const response = await request(app).get('/api/admin/perfis');
    expect(response.status).toBe(401);
    expect(response.body.codigo).toBe('TOKEN_MISSING');
  });
});
