const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const logger = require('../utils/logger');
const { generateToken, generateRefreshToken } = require('../middleware/authMiddleware');
const validate = require('../middleware/validateMiddleware');
const rateLimit = require('express-rate-limit');
const { 
  loginFirebaseSchema, 
  registerFirebaseSchema, 
  loginSchema, 
  registerSchema,
  usernameSignupSchema,
  usernameLoginSchema
} = require('../validations/authValidation');

// Advanced Rate Limiter for Authentication
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // limit each IP to 20 auth requests per window
  message: { success: false, error: 'Too many authentication attempts, please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply authLimiter to all routes in this router
router.use(authLimiter);

// Lazy Firebase Admin getter — avoids module-load-order issues
// admin is initialized in index.js before routes are loaded, so require() here is safe.
function getFirebaseAdmin() {
  try {
    const admin = require('firebase-admin');
    if (!admin.apps.length) return null;
    return admin;
  } catch {
    return null;
  }
}

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('FATAL: JWT_SECRET environment variable is missing in production!');
}

const User = require('../models/User');

/**
 * POST /api/auth/register-firebase
 */
router.post('/register-firebase', validate(registerFirebaseSchema), async (req, res) => {
  try {
    const { idToken, firebaseUid: clientUid, email, displayName, avatar } = req.body;

    // SECURITY: Verify Firebase ID Token on backend
    let firebaseUid = clientUid;
    if (idToken) {
      const admin = getFirebaseAdmin();
      if (!admin) {
        if (process.env.NODE_ENV === 'production') {
          return res.status(503).json({ success: false, error: 'Authentication service unavailable' });
        }
        // Dev: skip Firebase verification, use clientUid
        logger.warn('[Auth] Firebase Admin not initialized — skipping token verification in dev');
      } else {
        try {
          const decodedToken = await admin.auth().verifyIdToken(idToken);
          firebaseUid = decodedToken.uid;
          logger.info(`✅ Firebase token verified for UID: ${firebaseUid}`);
        } catch (err) {
          logger.error('❌ Firebase token verification failed: %s', err.message);
          return res.status(401).json({ success: false, error: 'Invalid authentication token' });
        }
      }
    } else if (process.env.NODE_ENV === 'production') {
      return res.status(401).json({ success: false, error: 'Authentication token required' });
    }

    let user = await User.findOne({ firebaseUid });

    // If not found by UID, check by email for account linking
    if (!user && email) {
      user = await User.findOne({ email: email.toLowerCase() });
      if (user) {
        user.firebaseUid = firebaseUid; // Link the new social provider to existing account
        logger.info(`🔗 Linked existing user ${user.email} with new Firebase UID: ${firebaseUid}`);
      }
    }
    
    if (!user) {
      user = new User({
        firebaseUid,
        email: email ? email.toLowerCase() : `${firebaseUid}@trips.app`,
        displayName: displayName || (email ? email.split('@')[0] : 'User'),
        avatar: avatar || null,
        followersCount: 0,
        followingCount: 0
      });
      await user.save();
      logger.info(`✅ User registered in MongoDB: ${user.email}`);
    } else {
      user.displayName = displayName || user.displayName;
      user.avatar = avatar || user.avatar;
      user.updatedAt = new Date();
      await user.save();
      logger.info(`✅ User updated in MongoDB: ${user.email}`);
    }

    const token = generateToken(user._id, user.email, user.firebaseUid || user.uid);
    const refreshToken = generateRefreshToken(user._id);
    res.json({
      success: true,
      token,
      refreshToken,
      user: {
        id: user._id,
        firebaseUid,
        email: user.email,
        displayName: user.displayName,
        avatar: user.avatar
      }
    });
  } catch (error) {
    logger.error('[Auth] Firebase register error: %O', error);
    res.status(500).json({ success: false, error: 'Registration failed' });
  }
});

/**
 * POST /api/auth/login-firebase
 */
router.post('/login-firebase', validate(loginFirebaseSchema), async (req, res) => {
  try {
    const { idToken, firebaseUid: clientUid, email, displayName, avatar } = req.body;

    // SECURITY: Verify Firebase ID Token on backend
    let firebaseUid = clientUid;
    if (idToken) {
      const admin = getFirebaseAdmin();
      if (!admin) {
        if (process.env.NODE_ENV === 'production') {
          return res.status(503).json({ success: false, error: 'Authentication service unavailable' });
        }
        logger.warn('[Auth] Firebase Admin not initialized — skipping token verification in dev');
      } else {
        try {
          const decodedToken = await admin.auth().verifyIdToken(idToken);
          firebaseUid = decodedToken.uid;
          logger.info(`✅ Firebase token verified for UID: ${firebaseUid}`);
        } catch (err) {
          logger.error('❌ Firebase token verification failed: %s', err.message);
          return res.status(401).json({ success: false, error: 'Invalid authentication token' });
        }
      }
    } else if (process.env.NODE_ENV === 'production') {
      return res.status(401).json({ success: false, error: 'Authentication token required' });
    }

    let user = await User.findOne({ firebaseUid });

    // If not found by UID, check by email for account linking
    if (!user && email) {
      user = await User.findOne({ email: email.toLowerCase() });
      if (user) {
        user.firebaseUid = firebaseUid; // Link the new social provider to existing account
        logger.info(`🔗 Linked existing user ${user.email} with new Firebase UID: ${firebaseUid}`);
      }
    }
    
    if (!user) {
      user = new User({
        firebaseUid,
        email: email ? email.toLowerCase() : `${firebaseUid}@trips.app`,
        displayName: displayName || (email ? email.split('@')[0] : 'User'),
        avatar: avatar || null
      });
      await user.save();
      logger.info(`✅ New user created on login: ${user.email}`);
    } else {
      user.displayName = displayName || user.displayName;
      user.avatar = avatar || user.avatar;
      user.updatedAt = new Date();
      await user.save();
      logger.info(`✅ User updated on login: ${user.email}`);
    }

    const token = generateToken(user._id, user.email, user.firebaseUid || user.uid);
    const refreshToken = generateRefreshToken(user._id);
    res.json({
      success: true,
      token,
      refreshToken,
      user: {
        id: user._id,
        firebaseUid,
        email: user.email,
        displayName: user.displayName,
        avatar: user.avatar
      }
    });
  } catch (error) {
    logger.error('[Auth] Firebase login error: %O', error);
    res.status(500).json({ success: false, error: 'Login failed' });
  }
});

/**
 * POST /api/auth/register
 */
router.post('/register', validate(registerSchema), async (req, res) => {
  try {
    const { email, password, displayName } = req.body;
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) return res.status(400).json({ success: false, error: 'User already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({
      email: email.toLowerCase(),
      password: hashedPassword,
      displayName: displayName || email.split('@')[0]
    });
    await user.save();

    const token = generateToken(user._id, user.email, user.firebaseUid || user.uid);
    const refreshToken = generateRefreshToken(user._id);
    res.status(201).json({ success: true, token, refreshToken, user: { id: user._id, email: user.email, displayName: user.displayName } });
  } catch (error) {
    logger.error('[Auth] Register error: %O', error);
    res.status(500).json({ success: false, error: 'Registration failed' });
  }
});

/**
 * POST /api/auth/login
 */
router.post('/login', validate(loginSchema), async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if (!user || !user.password) return res.status(401).json({ success: false, error: 'Invalid email or password' });

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) return res.status(401).json({ success: false, error: 'Invalid email or password' });

    if (user.status === 'suspended' || user.status === 'banned') {
      return res.status(403).json({ success: false, error: `Account is ${user.status}` });
    }

    const token = generateToken(user._id, email, user.firebaseUid || user.uid);
    const refreshToken = generateRefreshToken(user._id);
    res.json({ success: true, token, refreshToken, user: { id: user._id, email: user.email, displayName: user.displayName } });
  } catch (error) {
    logger.error('[Auth] Login error: %O', error);
    res.status(500).json({ success: false, error: 'Login failed' });
  }
});

/**
 * POST /api/auth/verify
 */
router.post('/verify', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'No token provided' });

    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ success: true, user: { id: decoded.userId, email: decoded.email } });
  } catch (error) {
    logger.error('[Auth] Verify error: %s', error.message);
    res.status(401).json({ success: false, error: 'Invalid token' });
  }
});

/**
 * POST /api/auth/logout
 */
router.post('/logout', async (req, res) => {
  try {
    logger.info('✅ User logged out');
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Logout failed' });
  }
});

/**
 * POST /api/auth/refresh-token
 * Refresh access token using a valid refresh token
 */
router.post('/refresh-token', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ success: false, error: 'Refresh token is required' });
    }

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ success: false, error: 'Invalid or expired refresh token' });
    }

    if (decoded.type !== 'refresh_token') {
      return res.status(401).json({ success: false, error: 'Invalid token type' });
    }

    const user = await User.findById(decoded.userId).lean();
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    if (user.status === 'suspended' || user.status === 'banned') {
      return res.status(403).json({ success: false, error: `Account is ${user.status}` });
    }

    const token = generateToken(user._id, user.email, user.firebaseUid || user.uid);
    const newRefreshToken = generateRefreshToken(user._id);

    res.json({
      success: true,
      token,
      refreshToken: newRefreshToken
    });
  } catch (error) {
    logger.error('[Auth] Refresh token error: %O', error);
    res.status(500).json({ success: false, error: 'Failed to refresh token' });
  }
});

/**
 * GET /api/auth/username/check
 * Check if a username is available
 */
router.get('/username/check', async (req, res) => {
  try {
    const { username } = req.query;
    if (!username) return res.status(400).json({ success: false, error: 'Username is required' });

    const existingUser = await User.findOne({ username: username.toLowerCase().trim() });
    res.json({ success: true, available: !existingUser });
  } catch (error) {
    logger.error('[Auth] Username check error: %O', error);
    res.status(500).json({ success: false, error: 'Check failed' });
  }
});

/**
 * POST /api/auth/username/signup
 * Create a new account with a username + password (PIN)
 */
router.post('/username/signup', validate(usernameSignupSchema), async (req, res) => {
  try {
    const { username, password, name, avatar } = req.body;

    if (!username) return res.status(400).json({ success: false, error: 'Username is required' });
    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
    }

    const cleanUsername = username.toLowerCase().trim();
    const existingUser = await User.findOne({ username: cleanUsername });
    if (existingUser) return res.status(400).json({ success: false, error: 'Username already taken' });

    // Hash the password before storing
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate internal email for backward compatibility
    const internalEmail = `${cleanUsername}@trips-social.internal`;

    const user = new User({
      username: cleanUsername,
      displayName: name || cleanUsername,
      email: internalEmail,
      password: hashedPassword,
      avatar: avatar || null,
      followersCount: 0,
      followingCount: 0
    });

    await user.save();
    logger.info(`✅ User registered with username: ${cleanUsername}`);

    const token = generateToken(user._id, internalEmail, user.firebaseUid || user.uid);
    const refreshToken = generateRefreshToken(user._id);

    res.status(201).json({
      success: true,
      token,
      refreshToken,
      user: {
        id: user._id,
        username: user.username,
        displayName: user.displayName,
        avatar: user.avatar
      }
    });
  } catch (error) {
    logger.error('[Auth] Username signup error: %O', error);
    res.status(500).json({ success: false, error: 'Registration failed' });
  }
});

/**
 * POST /api/auth/username/login
 * Login with username + password
 */
router.post('/username/login', validate(usernameLoginSchema), async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username) return res.status(400).json({ success: false, error: 'Username is required' });
    if (!password) return res.status(400).json({ success: false, error: 'Password is required' });

    const cleanUsername = username.toLowerCase().trim();
    const user = await User.findOne({ username: cleanUsername }).select('+password');

    // Always use a constant-time comparison to prevent user enumeration
    if (!user || !user.password) {
      return res.status(401).json({ success: false, error: 'Invalid username or password' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ success: false, error: 'Invalid username or password' });
    }

    if (user.status === 'suspended' || user.status === 'banned') {
      return res.status(403).json({ success: false, error: `Account is ${user.status}` });
    }

    const token = generateToken(user._id, user.email, user.firebaseUid || user.uid);
    const refreshToken = generateRefreshToken(user._id);

    res.json({
      success: true,
      token,
      refreshToken,
      user: {
        id: user._id,
        username: user.username,
        displayName: user.displayName,
        avatar: user.avatar
      }
    });
  } catch (error) {
    logger.error('[Auth] Username login error: %O', error);
    res.status(500).json({ success: false, error: 'Login failed' });
  }
});

const sendEmail = require('../utils/email');

// ... (rest of the code until line 313)

/**
 * POST /api/auth/forgot-password
 * Send a 6-digit reset code to email
 */
router.post('/forgot-password', validate(require('../validations/authValidation').forgotPasswordSchema), async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      // Security: Don't reveal if user exists, but here we can just say 'sent if exists'
      return res.json({ success: true, message: 'If an account exists with that email, a code has been sent.' });
    }

    // Generate 6-digit code securely using crypto.randomInt
    const resetCode = crypto.randomInt(100000, 1000000).toString();
    
    user.resetCode = resetCode;
    user.resetCodeExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
    await user.save();

    // Send email
    try {
      await sendEmail({
        email: user.email,
        subject: 'Password Reset Verification Code',
        message: `Your password reset code is: ${resetCode}. It will expire in 10 minutes.`,
        html: `
          <div style="font-family: sans-serif; padding: 20px; color: #333;">
            <h2>Password Reset</h2>
            <p>You requested a password reset for your Trips account.</p>
            <p>Your verification code is:</p>
            <h1 style="color: #0A3D62; letter-spacing: 5px;">${resetCode}</h1>
            <p>This code will expire in 10 minutes.</p>
            <p>If you did not request this, please ignore this email.</p>
          </div>
        `
      });
      logger.info(`✅ Reset code sent to ${user.email}`);
    } catch (mailErr) {
      logger.error('❌ Failed to send reset email: %O', mailErr);
      // In development, we might want to return the code for testing
      if (process.env.NODE_ENV !== 'production') {
        return res.json({ success: true, message: 'Code generated (Email failed)', devCode: resetCode });
      }
      return res.status(500).json({ success: false, error: 'Failed to send email' });
    }

    res.json({ success: true, message: 'Verification code sent to email' });
  } catch (error) {
    logger.error('[Auth] Forgot password error: %O', error);
    res.status(500).json({ success: false, error: 'Failed to process request' });
  }
});

/**
 * POST /api/auth/reset-password
 * Reset password using verification code
 */
router.post('/reset-password', validate(require('../validations/authValidation').resetPasswordSchema), async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    
    const user = await User.findOne({ 
      email: email.toLowerCase(),
      resetCode: code,
      resetCodeExpires: { $gt: Date.now() }
    }).select('+password +resetCode +resetCodeExpires');

    if (!user) {
      return res.status(400).json({ success: false, error: 'Invalid or expired verification code' });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    
    // Clear reset code
    user.resetCode = undefined;
    user.resetCodeExpires = undefined;
    
    await user.save();
    
    logger.info(`✅ Password reset successfully for ${user.email}`);
    res.json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    logger.error('[Auth] Reset password error: %O', error);
    res.status(500).json({ success: false, error: 'Failed to reset password' });
  }
});

module.exports = router;
