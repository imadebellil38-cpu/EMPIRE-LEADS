const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

process.env.JWT_SECRET = 'test-secret-key';
process.env.NODE_ENV = 'test';

const { createTestDb } = require('./setup');
const bcrypt = require('bcryptjs');

let mockDb;

jest.mock('../db', () => {
  return new Proxy({}, {
    get(_, prop) {
      return mockDb[prop];
    }
  });
});

jest.mock('../services/email', () => ({
  sendResetEmail: jest.fn().mockResolvedValue(false),
  isEmailConfigured: jest.fn().mockReturnValue(false),
  sendProspectEmail: jest.fn().mockResolvedValue(false),
}));

jest.mock('../services/pdf', () => ({
  generateQuotePDF: jest.fn().mockResolvedValue(Buffer.from('fake-pdf')),
}));

let app;

function makeToken(userObj) {
  return jwt.sign(
    { id: userObj.id, email: userObj.email, is_admin: userObj.is_admin || 0 },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

function insertUser(email = 'user@test.com') {
  const hash = bcrypt.hashSync('password123', 10);
  const result = mockDb.prepare(
    'INSERT INTO users (email, password, plan, credits) VALUES (?, ?, ?, ?)'
  ).run(email, hash, 'free', 5);
  return { id: Number(result.lastInsertRowid), email, is_admin: 0 };
}

function insertQuote(userId, overrides = {}) {
  const token = crypto.randomBytes(16).toString('hex');
  const data = {
    number: '2026-001',
    items: '[]',
    subtotal: 100,
    tva_rate: 20,
    tva: 20,
    total: 120,
    notes: '',
    valid_until: '',
    status: 'draft',
    token,
    ...overrides,
  };
  const result = mockDb.prepare(`
    INSERT INTO quotes (user_id, number, items, subtotal, tva_rate, tva, total, notes, valid_until, status, token)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(userId, data.number, data.items, data.subtotal, data.tva_rate, data.tva, data.total, data.notes, data.valid_until, data.status, data.token);
  return { id: Number(result.lastInsertRowid), user_id: userId, ...data };
}

beforeEach(() => {
  mockDb = createTestDb();
  jest.resetModules();

  jest.doMock('../db', () => mockDb);
  jest.doMock('../services/email', () => ({
    sendResetEmail: jest.fn().mockResolvedValue(false),
    isEmailConfigured: jest.fn().mockReturnValue(false),
    sendProspectEmail: jest.fn().mockResolvedValue(false),
  }));
  jest.doMock('../services/pdf', () => ({
    generateQuotePDF: jest.fn().mockResolvedValue(Buffer.from('fake-pdf')),
  }));

  const { requireAuth } = require('../auth');
  const quotesRoutes = require('../routes/quotes');

  app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use('/api/quotes', quotesRoutes);
});

afterEach(() => {
  if (mockDb) mockDb.close();
});

// ── POST /api/quotes ──────────────────────────────────────────────────────────

describe('POST /api/quotes', () => {
  test('creates a new quote and returns id, number, token', async () => {
    const user = insertUser();
    const token = makeToken(user);

    const res = await request(app)
      .post('/api/quotes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [{ qty: 1, price: 100, description: 'Service A' }],
        tva_rate: 20,
        notes: 'Test quote',
      });

    expect(res.status).toBe(200);
    expect(res.body.id).toBeDefined();
    expect(res.body.number).toBeDefined();
    expect(res.body.token).toBeDefined();
  });

  test('creates quote with no items (empty quote)', async () => {
    const user = insertUser();
    const token = makeToken(user);

    const res = await request(app)
      .post('/api/quotes')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.id).toBeDefined();
  });

  test('returns 401 without token', async () => {
    const res = await request(app)
      .post('/api/quotes')
      .send({ items: [] });

    expect(res.status).toBe(401);
  });
});

// ── GET /api/quotes ───────────────────────────────────────────────────────────

describe('GET /api/quotes', () => {
  test('lists quotes for authenticated user', async () => {
    const user = insertUser();
    const token = makeToken(user);
    insertQuote(user.id, { number: '2026-001' });
    insertQuote(user.id, { number: '2026-002' });

    const res = await request(app)
      .get('/api/quotes')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(2);
  });

  test('returns empty array when user has no quotes', async () => {
    const user = insertUser();
    const token = makeToken(user);

    const res = await request(app)
      .get('/api/quotes')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('returns 401 without token', async () => {
    const res = await request(app).get('/api/quotes');
    expect(res.status).toBe(401);
  });
});

// ── Ownership isolation ───────────────────────────────────────────────────────

describe('Ownership isolation', () => {
  test('user A cannot see user B quotes via GET /api/quotes', async () => {
    const userA = insertUser('a@test.com');
    const userB = insertUser('b@test.com');
    insertQuote(userA.id, { number: '2026-001' });
    insertQuote(userA.id, { number: '2026-002' });

    const tokenB = makeToken(userB);
    const res = await request(app)
      .get('/api/quotes')
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });

  test('user B cannot GET user A quote by id', async () => {
    const userA = insertUser('a@test.com');
    const userB = insertUser('b@test.com');
    const quote = insertQuote(userA.id, { number: '2026-001' });

    const tokenB = makeToken(userB);
    const res = await request(app)
      .get(`/api/quotes/${quote.id}`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(404);
  });

  test('user B cannot update user A quote via PUT', async () => {
    const userA = insertUser('a@test.com');
    const userB = insertUser('b@test.com');
    const quote = insertQuote(userA.id, { number: '2026-001' });

    const tokenB = makeToken(userB);
    const res = await request(app)
      .put(`/api/quotes/${quote.id}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ notes: 'hacked' });

    expect(res.status).toBe(404);
  });

  test('user B cannot delete user A quote', async () => {
    const userA = insertUser('a@test.com');
    const userB = insertUser('b@test.com');
    const quote = insertQuote(userA.id, { number: '2026-001' });

    const tokenB = makeToken(userB);
    const res = await request(app)
      .delete(`/api/quotes/${quote.id}`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(404);

    // Quote should still exist
    const row = mockDb.prepare('SELECT id FROM quotes WHERE id = ?').get(quote.id);
    expect(row).toBeDefined();
  });
});

// ── PUT /api/quotes/:id ───────────────────────────────────────────────────────

describe('PUT /api/quotes/:id', () => {
  test('updates a quote with new items and recalculates totals', async () => {
    const user = insertUser();
    const token = makeToken(user);
    const quote = insertQuote(user.id);

    const res = await request(app)
      .put(`/api/quotes/${quote.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [{ qty: 2, price: 150, description: 'Service B' }],
        tva_rate: 20,
        notes: 'Updated notes',
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.subtotal).toBe(300);
    expect(res.body.tva).toBe(60);
    expect(res.body.total).toBe(360);
  });

  test('returns 404 for non-existent quote', async () => {
    const user = insertUser();
    const token = makeToken(user);

    const res = await request(app)
      .put('/api/quotes/99999')
      .set('Authorization', `Bearer ${token}`)
      .send({ notes: 'test' });

    expect(res.status).toBe(404);
  });

  test('returns 401 without token', async () => {
    const res = await request(app)
      .put('/api/quotes/1')
      .send({ notes: 'test' });

    expect(res.status).toBe(401);
  });
});

// ── DELETE /api/quotes/:id ────────────────────────────────────────────────────

describe('DELETE /api/quotes/:id', () => {
  test('deletes own quote', async () => {
    const user = insertUser();
    const token = makeToken(user);
    const quote = insertQuote(user.id);

    const res = await request(app)
      .delete(`/api/quotes/${quote.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const row = mockDb.prepare('SELECT id FROM quotes WHERE id = ?').get(quote.id);
    expect(row).toBeUndefined();
  });

  test('returns 404 for non-existent quote', async () => {
    const user = insertUser();
    const token = makeToken(user);

    const res = await request(app)
      .delete('/api/quotes/99999')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  test('returns 401 without token', async () => {
    const res = await request(app).delete('/api/quotes/1');
    expect(res.status).toBe(401);
  });
});

// ── GET /api/quotes/sign/:token (public) ─────────────────────────────────────

describe('GET /api/quotes/sign/:token', () => {
  test('returns quote data for a sent quote', async () => {
    const user = insertUser();
    const quote = insertQuote(user.id, { status: 'sent' });

    const res = await request(app)
      .get(`/api/quotes/sign/${quote.token}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(quote.id);
    expect(res.body.status).toBe('sent');
  });

  test('returns quote data for an accepted quote', async () => {
    const user = insertUser();
    const quote = insertQuote(user.id, { status: 'accepted' });

    const res = await request(app)
      .get(`/api/quotes/sign/${quote.token}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('accepted');
  });

  test('returns 404 for a draft quote (not yet sent)', async () => {
    const user = insertUser();
    const quote = insertQuote(user.id, { status: 'draft' });

    const res = await request(app)
      .get(`/api/quotes/sign/${quote.token}`);

    expect(res.status).toBe(404);
  });

  test('returns 404 for a non-existent token', async () => {
    const res = await request(app)
      .get('/api/quotes/sign/nonexistenttoken123');

    expect(res.status).toBe(404);
  });
});

// ── POST /api/quotes/sign/:token (public) ────────────────────────────────────

describe('POST /api/quotes/sign/:token', () => {
  test('accepts a valid signature for a sent quote', async () => {
    const user = insertUser();
    const quote = insertQuote(user.id, { status: 'sent' });

    const validSignature = 'data:image/png;base64,iVBORw0KGgoAAAANS';

    const res = await request(app)
      .post(`/api/quotes/sign/${quote.token}`)
      .send({ signature_data: validSignature });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    // Verify quote is now accepted
    const updated = mockDb.prepare('SELECT status FROM quotes WHERE id = ?').get(quote.id);
    expect(updated.status).toBe('accepted');
  });

  test('rejects signature for an already-accepted quote', async () => {
    const user = insertUser();
    const quote = insertQuote(user.id, { status: 'accepted' });

    const res = await request(app)
      .post(`/api/quotes/sign/${quote.token}`)
      .send({ signature_data: 'data:image/png;base64,abc' });

    expect(res.status).toBe(400);
  });

  test('rejects signature without data:image/ prefix', async () => {
    const user = insertUser();
    const quote = insertQuote(user.id, { status: 'sent' });

    const res = await request(app)
      .post(`/api/quotes/sign/${quote.token}`)
      .send({ signature_data: 'not-a-valid-signature' });

    expect(res.status).toBe(400);
  });

  test('rejects missing signature_data', async () => {
    const user = insertUser();
    const quote = insertQuote(user.id, { status: 'sent' });

    const res = await request(app)
      .post(`/api/quotes/sign/${quote.token}`)
      .send({});

    expect(res.status).toBe(400);
  });

  test('rejects oversized signature (>500KB)', async () => {
    const user = insertUser();
    const quote = insertQuote(user.id, { status: 'sent' });

    // Create a signature string longer than 500000 characters
    const oversizedSignature = 'data:image/png;base64,' + 'A'.repeat(500001);

    const res = await request(app)
      .post(`/api/quotes/sign/${quote.token}`)
      .send({ signature_data: oversizedSignature });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('volumineuse');
  });

  test('returns 400 for non-existent token', async () => {
    const res = await request(app)
      .post('/api/quotes/sign/nonexistenttoken')
      .send({ signature_data: 'data:image/png;base64,abc' });

    // Non-existent quote hits status check: !q -> returns 400
    expect(res.status).toBe(400);
  });
});

// ── GET /api/quotes/:id ───────────────────────────────────────────────────────

describe('GET /api/quotes/:id', () => {
  test('returns a specific quote for its owner', async () => {
    const user = insertUser();
    const token = makeToken(user);
    const quote = insertQuote(user.id, { number: '2026-001', notes: 'specific note' });

    const res = await request(app)
      .get(`/api/quotes/${quote.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(quote.id);
    expect(res.body.notes).toBe('specific note');
  });

  test('returns 404 for non-existent quote', async () => {
    const user = insertUser();
    const token = makeToken(user);

    const res = await request(app)
      .get('/api/quotes/99999')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});
