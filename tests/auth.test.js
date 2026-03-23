const request = require('supertest');
const express = require('express');

// Set env before requiring anything
process.env.JWT_SECRET = 'test-secret-key';
process.env.NODE_ENV = 'test';

const { createTestDb } = require('./setup');

// Use mock-prefixed variable so Jest allows it in factory
let mockDb;

// Mock db module — factory uses lazy reference via mockDb
jest.mock('../db', () => {
  // Return a proxy that delegates to mockDb at call time
  return new Proxy({}, {
    get(_, prop) {
      return mockDb[prop];
    }
  });
});

// Mock email service
jest.mock('../services/email', () => ({
  sendResetEmail: jest.fn().mockResolvedValue(false),
  isEmailConfigured: jest.fn().mockReturnValue(false),
}));

let app;

beforeEach(() => {
  mockDb = createTestDb();

  // Clear module cache for routes (they cache db reference)
  jest.resetModules();

  // Re-mock after resetModules
  jest.doMock('../db', () => mockDb);
  jest.doMock('../services/email', () => ({
    sendResetEmail: jest.fn().mockResolvedValue(false),
    isEmailConfigured: jest.fn().mockReturnValue(false),
  }));

  const authRoutes = require('../routes/auth');

  app = express();
  app.use(express.json());
  app.use('/api', authRoutes);
});

afterEach(() => {
  if (mockDb) mockDb.close();
});

describe('POST /api/register', () => {
  test('should register a new user', async () => {
    const res = await request(app)
      .post('/api/register')
      .send({ email: 'test@example.com', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe('test@example.com');
    expect(res.body.user.plan).toBe('free');
    expect(res.body.user.credits).toBe(0);
  });

  test('should reject duplicate email', async () => {
    await request(app)
      .post('/api/register')
      .send({ email: 'test@example.com', password: 'password123' });

    const res = await request(app)
      .post('/api/register')
      .send({ email: 'test@example.com', password: 'password456' });

    expect(res.status).toBe(409);
  });

  test('should reject short password', async () => {
    const res = await request(app)
      .post('/api/register')
      .send({ email: 'test@example.com', password: '123' });

    expect(res.status).toBe(400);
  });

  test('should reject invalid email', async () => {
    const res = await request(app)
      .post('/api/register')
      .send({ email: 'notanemail', password: 'password123' });

    expect(res.status).toBe(400);
  });

  test('should reject missing fields', async () => {
    const res = await request(app)
      .post('/api/register')
      .send({});

    expect(res.status).toBe(400);
  });
});

describe('POST /api/login', () => {
  beforeEach(async () => {
    await request(app)
      .post('/api/register')
      .send({ email: 'user@test.com', password: 'mypassword' });
  });

  test('should login with correct credentials', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ email: 'user@test.com', password: 'mypassword' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe('user@test.com');
  });

  test('should reject wrong password', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ email: 'user@test.com', password: 'wrongpassword' });

    expect(res.status).toBe(401);
  });

  test('should reject non-existent email', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ email: 'nobody@test.com', password: 'password123' });

    expect(res.status).toBe(401);
  });
});

describe('POST /api/forgot-password', () => {
  beforeEach(async () => {
    await request(app)
      .post('/api/register')
      .send({ email: 'reset@test.com', password: 'password123' });
  });

  test('should generate reset token', async () => {
    const res = await request(app)
      .post('/api/forgot-password')
      .send({ email: 'reset@test.com' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.token).toBeDefined();
  });

  test('should return ok even for non-existent email', async () => {
    const res = await request(app)
      .post('/api/forgot-password')
      .send({ email: 'nobody@test.com' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

describe('POST /api/reset-password', () => {
  let resetToken;

  beforeEach(async () => {
    await request(app)
      .post('/api/register')
      .send({ email: 'reset@test.com', password: 'oldpassword' });

    const res = await request(app)
      .post('/api/forgot-password')
      .send({ email: 'reset@test.com' });

    resetToken = res.body.token;
  });

  test('should reset password with valid token', async () => {
    const res = await request(app)
      .post('/api/reset-password')
      .send({ token: resetToken, password: 'newpassword123' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const loginRes = await request(app)
      .post('/api/login')
      .send({ email: 'reset@test.com', password: 'newpassword123' });

    expect(loginRes.status).toBe(200);
  });

  test('should reject invalid token', async () => {
    const res = await request(app)
      .post('/api/reset-password')
      .send({ token: 'invalidtoken', password: 'newpassword' });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/me', () => {
  test('should return user info with valid token', async () => {
    const regRes = await request(app)
      .post('/api/register')
      .send({ email: 'me@test.com', password: 'password123' });

    const token = regRes.body.token;

    const res = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('me@test.com');
  });

  test('should reject without token', async () => {
    const res = await request(app).get('/api/me');

    expect(res.status).toBe(401);
  });

  test('should reject with invalid token', async () => {
    const res = await request(app)
      .get('/api/me')
      .set('Authorization', 'Bearer not.a.valid.jwt.token');

    expect(res.status).toBe(401);
  });

  test('should reject with malformed Authorization header', async () => {
    const res = await request(app)
      .get('/api/me')
      .set('Authorization', 'notbearer sometoken');

    expect(res.status).toBe(401);
  });
});

describe('Referral bonus', () => {
  test('should award +5 credits to referrer and new user on valid referral code', async () => {
    // Register the referrer first
    const referrerRes = await request(app)
      .post('/api/register')
      .send({ email: 'referrer@test.com', password: 'password123' });

    expect(referrerRes.status).toBe(200);
    const referrerToken = referrerRes.body.token;

    // Get referrer's referral_code from /api/me
    const meRes = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${referrerToken}`);
    expect(meRes.status).toBe(200);

    // Look up the referral code directly from the db
    const referralCode = mockDb.prepare('SELECT referral_code FROM users WHERE email = ?').get('referrer@test.com')?.referral_code;
    expect(referralCode).toBeDefined();

    // Register a new user with the referral code
    const newUserRes = await request(app)
      .post('/api/register')
      .send({ email: 'newbie@test.com', password: 'password123', referral_code: referralCode });

    expect(newUserRes.status).toBe(200);

    // Verify credits were awarded
    const referrer = mockDb.prepare('SELECT credits FROM users WHERE email = ?').get('referrer@test.com');
    const newbie = mockDb.prepare('SELECT credits FROM users WHERE email = ?').get('newbie@test.com');
    expect(referrer.credits).toBe(5);  // referrer gets +5 (started at 0)
    expect(newbie.credits).toBe(5);    // new user gets +5 (started at 0)
  });

  test('should not award credits for invalid referral code', async () => {
    const res = await request(app)
      .post('/api/register')
      .send({ email: 'new@test.com', password: 'password123', referral_code: 'invalidcode' });

    expect(res.status).toBe(200); // still registers successfully
    const user = mockDb.prepare('SELECT credits FROM users WHERE email = ?').get('new@test.com');
    expect(user.credits).toBe(0); // no bonus
  });
});
