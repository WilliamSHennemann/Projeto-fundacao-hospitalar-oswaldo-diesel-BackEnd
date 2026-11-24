import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from './app.js';

describe('API documentation', () => {
  it('serves the interactive Swagger UI at /docs', async () => {
    const response = await request(app).get('/docs/');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.text).toContain('swagger-ui');
  });

  it('serves the OpenAPI specification as JSON', async () => {
    const response = await request(app).get('/docs/openapi.json');

    expect(response.status).toBe(200);
    expect(response.body.openapi).toBe('3.0.0');
    expect(response.body.paths['/dashboard/equipes']).toBeDefined();
    expect(response.body.paths['/tvwall'].get.security).toEqual([]);
  });
});
