import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/utils/prisma';
import jwt from 'jsonwebtoken';

import { ACCESS_TOKEN_SECRET } from '../src/config';

describe('Bidding API (Supertest)', () => {
  let userToken: string;
  let unprivilegedToken: string;
  let unprivilegedUserId: string;

  beforeAll(async () => {
    // Basic setup for auth
    const runId = Math.random().toString(36).substring(7);

    const user = await prisma.user.create({
      data: { email: `talent_${runId}@test.com`, username: `talent_${runId}`, password: 'pw', roleType: ['serviceFoxer'], name: 'Talent' }
    });

    const unprivileged = await prisma.user.create({
      data: { email: `none_${runId}@test.com`, username: `none_${runId}`, password: 'pw', roleType: [], name: 'None' }
    });
    unprivilegedUserId = unprivileged.id;

    userToken = jwt.sign({ userId: user.id, email: user.email, roleType: user.roleType }, ACCESS_TOKEN_SECRET);
    unprivilegedToken = jwt.sign({ userId: unprivileged.id, email: unprivileged.email, roleType: unprivileged.roleType }, ACCESS_TOKEN_SECRET);
  });

  afterAll(async () => {
    await prisma.$executeRaw`TRUNCATE TABLE "users" CASCADE;`;
  });

  it('POST /api/v1/bids/service - enforces auth token', async () => {
    const res = await request(app)
      .post('/api/v1/bids/service')
      .send({ eventId: 'uuid', eventTemplateServiceId: 'uuid', proposedServiceId: 'uuid', proposedPrice: 100 });
    
    expect(res.status).toBe(401);
  });

  it('POST /api/v1/bids/service - validates payload (missing fields)', async () => {
    const res = await request(app)
      .post('/api/v1/bids/service')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ eventId: '123' }); // missing proposedPrice, proposedServiceId, etc
    
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/v1/bids/service - enforces serviceFoxer capability (triggers controller logic)', async () => {
    // If we use unprivilegedToken, the service layer throws an error or the controller catches it
    const res = await request(app)
      .post('/api/v1/bids/service')
      .set('Authorization', `Bearer ${unprivilegedToken}`)
      .send({
        eventId: '00000000-0000-0000-0000-000000000000',
        eventTemplateServiceId: '00000000-0000-0000-0000-000000000000',
        proposedServiceId: '00000000-0000-0000-0000-000000000000',
        proposedPrice: 100
      });

    // The validation passes but the service layer should throw an error regarding capabilities
    expect([400, 403, 500]).toContain(res.status);
    expect(res.body.message || res.body.error).toContain('Insufficient permissions');
  });

  it('PATCH /api/v1/bids/service/:id/accept - enforces auth token', async () => {
    const res = await request(app).patch('/api/v1/bids/service/fake-id/accept');
    expect(res.status).toBe(401);
  });

  it('PATCH /api/v1/bids/asset/:id/reject - enforces auth token', async () => {
    const res = await request(app).patch('/api/v1/bids/asset/fake-id/reject');
    expect(res.status).toBe(401);
  });
});
