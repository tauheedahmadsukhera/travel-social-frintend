const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

// ============= JWT SECRET MANAGEMENT =============

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || !String(secret).trim()) {
    throw new Error('JWT_SECRET is not configured (set it in your host env, e.g. Render Environment)');
  }
  // Production guard: reject weak/dictionary secrets
  if (process.env.NODE_ENV === 'production' && secret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters in production');
  }
  return String(secret).trim();
}

const getJwtSecretOrNull = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret || !String(secret).trim()) return null;
  return String(secret).trim();
};

// ============= TOKEN VERIFICATION =============

const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Missing or invalid Authorization header'
      });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, getJwtSecret());
    req.user = decoded;
    req.userId = decoded.userId;

    // SECURITY: Verify user status in database in real-time to prevent access control bypass
    const User = mongoose.model('User');
    const user = await User.findById(decoded.userId).select('status role').lean();
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User account not found'
      });
    }

    if (user.status === 'suspended' || user.status === 'banned') {
      return res.status(403).json({
        success: false,
        error: `Your account has been ${user.status}. Access denied.`
      });
    }

    // Sync actual role from DB to req.user
    req.user.role = user.role;

    next();
  } catch (error) {
    // Don't leak internal error details to client
    const message = error.name === 'TokenExpiredError'
      ? 'Token has expired'
      : 'Invalid or expired token';
    return res.status(401).json({
      success: false,
      error: message
    });
  }
};

/**
 * Optional auth — attaches user if token present, but doesn't block.
 * Useful for public routes that return extra data for authenticated users.
 */
const optionalAuth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, getJwtSecret());
      req.user = decoded;
      req.userId = decoded.userId;
    }
  } catch {
    // Silently continue — user is just anonymous
  }
  next();
};

// ============= TOKEN GENERATION =============

const generateToken = (userId, email, firebaseUid = null) => {
  return jwt.sign(
    {
      userId: String(userId),
      email,
      firebaseUid: firebaseUid ? String(firebaseUid) : null,
      iat: Math.floor(Date.now() / 1000),
    },
    getJwtSecret(),
    { expiresIn: '7d' }
  );
};

const generateRefreshToken = (userId) => {
  return jwt.sign(
    {
      userId: String(userId),
      type: 'refresh_token',
      iat: Math.floor(Date.now() / 1000),
    },
    getJwtSecret(),
    { expiresIn: '30d' }
  );
};

// ============= AUTHORIZATION MIDDLEWARE =============

/**
 * Checks that the authenticated user's role is 'admin'.
 * Must be used AFTER verifyToken.
 */
const isAdmin = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    // Look up the actual user record to check role
    const User = mongoose.model('User');
    const user = await User.findById(req.userId).select('role').lean();

    if (!user || user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Forbidden: Admin access required' });
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Ensures the authenticated user owns the resource they're modifying.
 * Compares req.userId (from JWT) against req.params[paramName].
 * Admins bypass this check.
 *
 * @param {string} paramName - The route param containing the resource owner's ID (default: 'uid')
 */
const requireOwnership = (paramName = 'uid') => {
  return async (req, res, next) => {
    try {
      const resourceOwnerId = req.params[paramName];
      const authenticatedUserId = String(req.userId);

      if (!resourceOwnerId) {
        return res.status(400).json({ success: false, error: 'Resource owner ID missing' });
      }

      // Check direct match first
      if (authenticatedUserId === resourceOwnerId) {
        return next();
      }

      // Check if authenticated user's MongoDB _id, firebaseUid, or uid matches
      const User = mongoose.model('User');
      const authenticatedUser = await User.findById(authenticatedUserId)
        .select('firebaseUid uid role')
        .lean();

      if (!authenticatedUser) {
        return res.status(401).json({ success: false, error: 'User not found' });
      }

      // Admin bypass
      if (authenticatedUser.role === 'admin') {
        return next();
      }

      // Check if the resource owner ID matches any of the user's identifiers
      const myIds = [
        String(authenticatedUser._id),
        authenticatedUser.firebaseUid,
        authenticatedUser.uid
      ].filter(Boolean);

      if (myIds.includes(resourceOwnerId)) {
        return next();
      }

      return res.status(403).json({ success: false, error: 'Forbidden: You can only modify your own resources' });
    } catch (error) {
      next(error);
    }
  };
};

module.exports = {
  verifyToken,
  optionalAuth,
  generateToken,
  generateRefreshToken,
  isAdmin,
  requireOwnership,
  getJwtSecret,
  getJwtSecretOrNull
};
