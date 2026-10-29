import request from 'supertest';
import { strFromU8, unzipSync } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';
import app from '../../app.js';
import { appStore } from '../../shared/store.js';

let temporaryUserId;

const binaryParser = (res, callback) => {
  const chunks = [];
  res.on('data', (chunk) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
};

afterEach(() => {
  if (temporaryUserId) appStore.usuarios = appStore.usuarios.filter((user) => user.id !== temporaryUserId);
  temporaryUserId = undefined;
});

describe('sector report exports', () => {
  it('downloads valid Excel and PDF reports', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: 'super@fundacao.com', senha: 'super123' });
    const auth = { Authorization: `Bearer ${login.body.token}` };

    const excel = await request(app).get('/api/exportacoes/excel?inicio=2026-01-01&fim=2026-12-31').set(auth).buffer(true).parse(binaryParser);
    expect(excel.status).toBe(200);
    expect(excel.headers['content-type']).toContain('spreadsheetml.sheet');
    expect(excel.headers['content-disposition']).toContain('.xlsx');
    expect(excel.body.subarray(0, 2).toString()).toBe('PK');

    const workbookFiles = unzipSync(excel.body);
    const worksheet = strFromU8(workbookFiles['xl/worksheets/sheet1.xml']);
    expect(worksheet).toContain('Setor');
    expect(worksheet).toContain('Média das avaliações');

    const pdf = await request(app).get('/api/exportacoes/pdf').set(auth).buffer(true).parse(binaryParser);
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect(pdf.body.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('exports only the sector assigned to management users', async () => {
    temporaryUserId = Math.max(0, ...appStore.usuarios.map((user) => user.id)) + 1;
    appStore.usuarios.push({
      id: temporaryUserId,
      nome: 'Gestão Recepção',
      email: 'gestao-export@test.local',
      perfil_id: 3,
      perfil: 'gestao',
      setor_id: 1,
      permissoes: ['gestao'],
      ativo: true,
    });
    const { issueToken } = await import('../auth/auth.routes.js');
    const token = issueToken({
      id: temporaryUserId,
      email: 'gestao-export@test.local',
      perfil: 'gestao',
      permissoes: ['gestao'],
      setor_id: 1,
    });
    const auth = { Authorization: `Bearer ${token}` };

    const excel = await request(app).get('/api/exportacoes/excel').set(auth).buffer(true).parse(binaryParser);
    expect(excel.status).toBe(200);
    const workbookFiles = unzipSync(excel.body);
    const worksheet = strFromU8(workbookFiles['xl/worksheets/sheet1.xml']);
    expect(worksheet).toContain('Recepção');
    expect(worksheet).not.toContain('Triagem');

    const denied = await request(app).get('/api/exportacoes/pdf?setor_id=2').set(auth);
    expect(denied.status).toBe(403);
    expect(denied.body.codigo).toBe('SECTOR_FORBIDDEN');
  });
});
