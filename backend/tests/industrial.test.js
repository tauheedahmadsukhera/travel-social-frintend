const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');



// Mock Firebase Admin
jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  credential: { cert: jest.fn() },
  apps: [],
}));

// Set environment variables for testing
process.env.JWT_SECRET = 'test_secret_for_industrial_tests';
process.env.ALLOWED_ORIGINS = '*';

const app = require('../src/index');

describe('🚀 Industrial Security & Stability Suite', () => {
  
  describe('🛡️ Authentication & Authorization', () => {
    
    test('GET /api/posts - Should fail without Authorization header', async () => {
      const res = await request(app).get('/api/posts');
      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Missing or invalid Authorization header');
    });

    test('GET /api/status - Public endpoint should succeed', async () => {
      const res = await request(app).get('/api/status');
      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('online');
    });

    test('GET /api/gdpr/users/someid/export - Should fail without Auth', async () => {
      const res = await request(app).get('/api/gdpr/users/someid/export');
      expect(res.statusCode).toBe(401);
    });

    test('POST /api/admin/stats - Should fail for non-admin even if authenticated', async () => {
      // Create a valid token for a regular user
      const { generateToken } = require('../src/middleware/authMiddleware');
      const validObjectId = new mongoose.Types.ObjectId();
      
      // Create user in DB to pass verifyToken verification
      const User = mongoose.model('User');
      await User.create({
        _id: validObjectId,
        displayName: 'Regular User',
        email: 'user@example.com',
        role: 'user',
        status: 'active'
      });

      const token = generateToken(validObjectId.toString(), 'user@example.com');

      const res = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${token}`);
      
      // Clean up mock user
      await User.deleteOne({ _id: validObjectId });

      // It should be 403 Forbidden because the mock user role is 'user'
      expect(res.statusCode).toBe(403);
    });
  });

  describe('🧪 Injection & Input Sanitization', () => {
    test('GET /api/users/search - Should handle regex characters safely', async () => {
      const { generateToken } = require('../src/middleware/authMiddleware');
      const validObjectId = new mongoose.Types.ObjectId();

      // Create user in DB to pass verifyToken verification
      const User = mongoose.model('User');
      await User.create({
        _id: validObjectId,
        displayName: 'Search User',
        email: 'user@example.com',
        role: 'user',
        status: 'active'
      });

      const token = generateToken(validObjectId.toString(), 'user@example.com');

      const res = await request(app)
        .get('/api/users/search?q=.*')
        .set('Authorization', `Bearer ${token}`);
      
      // Clean up mock user
      await User.deleteOne({ _id: validObjectId });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('💾 Caching System', () => {
    test('Redis service should handle missing URL gracefully', () => {
      const redis = require('../src/utils/redis');
      expect(redis.redis).toBeUndefined(); // Since process.env.REDIS_URL is not set
    });
  });

});
