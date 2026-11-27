import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import app from '../../app.js';
import { databaseConfigured, pool } from '../../config/database.js';
import { issueToken } from '../auth/auth.routes.js';

const databaseDescribe = databaseConfigured ? describe : describe.skip;

databaseDescribe('admin user management with PostgreSQL', () => {
  it('selects the dedicated Ouvidoria profile and protects Super Admin accounts', async () => {
    const userIds = [];
    const profileIds = [];
    const suffix = randomUUID();
    try {
      const mixedProfile = await pool.query(
        `INSERT INTO perfil (nome, permissoes)
         VALUES ($1, $2::jsonb) RETURNING id`,
        [`Teste Super Admin com Ouvidoria ${suffix}`, JSON.stringify({ roles: ['super_admin', 'ouvidoria'] })],
      );
      profileIds.push(mixedProfile.rows[0].id);

      let dedicatedProfile = await pool.query(
        `SELECT id FROM perfil
         WHERE permissoes->'roles' = '["ouvidoria"]'::jsonb
           AND NOT (permissoes->'roles' @> '["super_admin"]'::jsonb)`,
      );
      if (!dedicatedProfile.rowCount) {
        dedicatedProfile = await pool.query(
          `INSERT INTO perfil (nome, permissoes)
           VALUES ($1, $2::jsonb) RETURNING id`,
          [`Teste Ouvidoria ${suffix}`, JSON.stringify({ roles: ['ouvidoria'] })],
        );
        profileIds.push(dedicatedProfile.rows[0].id);
      }

      const superProfile = await pool.query(
        `INSERT INTO perfil (nome, permissoes)
         VALUES ($1, $2::jsonb) RETURNING id`,
        [`Teste Super Admin ${suffix}`, JSON.stringify({ roles: ['super_admin'] })],
      );
      profileIds.push(superProfile.rows[0].id);
      const actor = await pool.query(
        `INSERT INTO usuario (nome, email, perfil_id, ativo)
         VALUES ($1, $2, $3, TRUE) RETURNING id`,
        ['Administrador de teste', `admin-${suffix}@example.invalid`, superProfile.rows[0].id],
      );
      userIds.push(actor.rows[0].id);
      const target = await pool.query(
        `INSERT INTO usuario (nome, email, perfil_id, ativo)
         VALUES ($1, $2, $3, TRUE) RETURNING id`,
        ['Super Admin protegido', `super-${suffix}@example.invalid`, superProfile.rows[0].id],
      );
      userIds.push(target.rows[0].id);
      const inactiveSuper = await pool.query(
        `INSERT INTO usuario (nome, email, perfil_id, ativo)
         VALUES ($1, $2, $3, FALSE) RETURNING id`,
        ['Super Admin inativo', `inactive-super-${suffix}@example.invalid`, superProfile.rows[0].id],
      );
      userIds.push(inactiveSuper.rows[0].id);

      const token = issueToken({
        id: actor.rows[0].id,
        email: `admin-${suffix}@example.invalid`,
        perfil: 'super_admin',
        permissoes: ['super_admin'],
      });
      const auth = { Authorization: `Bearer ${token}` };
      const created = await request(app).post('/api/admin/usuarios')
        .set(auth)
        .send({
          nome: 'Conta Ouvidoria de teste',
          email: `ouvidoria-${suffix}@example.invalid`,
          senha: 'senha12345',
          perfil: 'ouvidoria',
        });

      expect(created.status).toBe(201);
      userIds.push(created.body.id);
      const stored = await pool.query(
        `SELECT u.perfil_id, u.ativo
         FROM usuario u WHERE u.id = $1`,
        [created.body.id],
      );
      expect(stored.rows[0].perfil_id).toBe(dedicatedProfile.rows[0].id);

      const listed = await request(app).get('/api/admin/usuarios?incluir_inativos=true').set(auth);
      expect(listed.status).toBe(200);
      expect(listed.body.find((user) => user.id === created.body.id)).toMatchObject({
        perfil: 'ouvidoria',
        permissoes: ['ouvidoria'],
      });

      const deactivated = await request(app).delete(`/api/admin/usuarios/${created.body.id}`).set(auth);
      expect(deactivated.status).toBe(200);
      const inactiveOuvidoria = await pool.query('SELECT ativo FROM usuario WHERE id = $1', [created.body.id]);
      expect(inactiveOuvidoria.rows[0].ativo).toBe(false);

      const reactivated = await request(app).post('/api/admin/usuarios')
        .set(auth)
        .send({
          nome: 'Conta Ouvidoria reativada',
          email: `ouvidoria-${suffix}@example.invalid`,
          senha: 'senha12345',
          perfil: 'ouvidoria',
        });
      expect(reactivated.status).toBe(201);
      const reactivatedProfile = await pool.query(
        'SELECT perfil_id, ativo FROM usuario WHERE id = $1',
        [created.body.id],
      );
      expect(reactivatedProfile.rows[0]).toEqual({
        perfil_id: dedicatedProfile.rows[0].id,
        ativo: true,
      });

      const protectedDelete = await request(app).delete(`/api/admin/usuarios/${target.rows[0].id}`).set(auth);
      expect(protectedDelete.status).toBe(404);
      const protectedEdit = await request(app).patch(`/api/admin/usuarios/${target.rows[0].id}`)
        .set(auth)
        .send({ nome: 'Tentativa de rebaixamento' });
      expect(protectedEdit.status).toBe(404);
      const protectedStatus = await pool.query(
        'SELECT nome, ativo, perfil_id FROM usuario WHERE id = $1',
        [target.rows[0].id],
      );
      expect(protectedStatus.rows[0]).toEqual({
        nome: 'Super Admin protegido',
        ativo: true,
        perfil_id: superProfile.rows[0].id,
      });

      const refusedReactivation = await request(app).post('/api/admin/usuarios')
        .set(auth)
        .send({
          nome: 'Tentativa de rebaixamento',
          email: `inactive-super-${suffix}@example.invalid`,
          senha: 'senha12345',
          perfil: 'ouvidoria',
        });
      expect(refusedReactivation.status).toBe(404);
      const inactiveSuperStatus = await pool.query(
        'SELECT ativo, perfil_id FROM usuario WHERE id = $1',
        [inactiveSuper.rows[0].id],
      );
      expect(inactiveSuperStatus.rows[0]).toEqual({
        ativo: false,
        perfil_id: superProfile.rows[0].id,
      });
    } finally {
      if (userIds.length) await pool.query('DELETE FROM usuario WHERE id = ANY($1::int[])', [userIds]);
      if (profileIds.length) await pool.query('DELETE FROM perfil WHERE id = ANY($1::int[])', [profileIds]);
    }
  });
});
