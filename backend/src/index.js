require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const hpp = require('hpp');
const mongoSanitize = require('express-mongo-sanitize');
const mongoose = require('mongoose');
const admin = require('firebase-admin');
const path = require('path');
const { initSentry, setupSentryErrorHandler } = require('./utils/sentry');
const { validateEnv } = require('./config/validateEnv');
const compression = require('compression');

// ====== VALIDATE ENVIRONMENT VARIABLES ON STARTUP ======
// This will throw and crash the process if critical vars are missing.
try {
  validateEnv();
} catch (err) {
  console.error('🔴 FATAL: Environment validation failed:', err.message);
  process.exit(1);
}

// ====== AUTO-REQUIRE ALL MODELS ======
require('./models/User');
require('./models/Post');
require('./models/Category');
require('./models/LiveStream');
require('./models/Conversation');
require('./models/Message');
require('./models/Passport');
require('./models/Follow');
require('./models/Comment');
require('./models/Story');
require('./models/Highlight');
require('./models/Section');
require('./models/Notification');
require('./models/Group');
require('./models/Report');
require('./models/Block');
require('./models/AdminLog');
require('./models/Region');

const app = express();
const PORT = process.env.PORT || 5000;

// ============= RATE LIMITING =============
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // limit each IP to 300 requests per windowMs (defense against DDoS/scraping)
  message: { success: false, error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// ============= SENTRY INITIALIZATION =============
// Must be called before any other middleware
initSentry(app);

// ============= FIREBASE INITIALIZATION =============
try {
  const serviceAccountPath = path.join(__dirname, '../serviceAccountKey.json');
  const serviceAccount = require(serviceAccountPath);
  
  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id,
    });
  }
  
  console.log('✅ Firebase Admin initialized');
} catch (error) {
  console.warn('⚠️ Firebase Admin initialization warning:', error.message);
}

// ============= MIDDLEWARE =============
const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [];
if (allowedOrigins.length === 0 && process.env.NODE_ENV === 'production') {
  console.error('❌ CRITICAL: ALLOWED_ORIGINS not configured for production');
  process.exit(1);
}
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' ? allowedOrigins : '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'userid', 'x-requested-with'],
  credentials: true
};
app.use(compression());
app.use(cors(corsOptions));
app.get('/api/ping-v2', (req, res) => res.json({ success: true, message: 'pong-v2', timestamp: new Date() }));
// Request Logger for debugging mobile connections
app.use((req, res, next) => {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`🔍 [DEBUG] Incoming: ${req.method} ${req.originalUrl || req.url}`);
  }
  next();
});
app.use(helmet({ contentSecurityPolicy: false })); // Disable CSP for easier dev testing
app.use(mongoSanitize());
app.use(hpp());
// Reduced from 50mb to 5mb to prevent DDoS payload attacks
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// Static files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/assests', express.static(path.join(__dirname, '../assests')));
app.use('/stamps', express.static(path.join(__dirname, '../stamps')));

// ============= DATABASE CONNECTION FUNCTION =============
const connectDatabase = async () => {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('🔴 FATAL: MONGO_URI environment variable is not set!');
    process.exit(1);
  }
  console.log('Testing connection to:', mongoUri ? mongoUri.split('@')[1] : 'undefined');
  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000, // Match test-db options
    });
    console.log('✅ MongoDB connected');
  } catch (err) {
    console.error('🔴 FATAL: MongoDB connection failed:', err.message);
    process.exit(1);
  }
};

// ============= ROUTES =============
const routes = require('./routes');
app.use('/api', routes);

// ============= SENTRY ERROR HANDLER =============
// Must be registered after all controllers and before other error middleware
setupSentryErrorHandler(app);

// ============= ERROR RATE ALERTING =============
// Monitors critical error spike thresholds
const errorAlertMiddleware = require('./middleware/errorAlertMiddleware');
app.use(errorAlertMiddleware);

app.get('/share/post/:id', async (req, res) => {
  const postId = req.params.id;
  try {
    const Post = mongoose.model('Post');
    const User = mongoose.model('User');
    const post = await Post.findById(postId);
    let authorName = 'Someone';
    let imageUrl = '';
    let caption = '';
    
    if (post) {
      caption = post.content || post.caption || '';
      imageUrl = (post.mediaUrls && post.mediaUrls[0]) || '';
      const author = await User.findById(post.userId);
      if (author) {
        authorName = author.displayName || author.username || author.name || 'Someone';
      }
    }
    
    res.send(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Check out this post on Trips!</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: #fafafa;
      margin: 0;
      padding: 0;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
    }
    .card {
      background: #fff;
      border: 1px solid #dbdbdb;
      border-radius: 12px;
      max-width: 450px;
      width: 90%;
      padding: 24px;
      text-align: center;
      box-shadow: 0 4px 12px rgba(0,0,0,0.05);
    }
    .avatar {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      object-fit: cover;
      background: #eee;
      margin-bottom: 12px;
    }
    h1 {
      font-size: 18px;
      color: #262626;
      margin: 0 0 8px 0;
    }
    p {
      font-size: 14px;
      color: #8e8e8e;
      margin: 0 0 20px 0;
      line-height: 1.4;
    }
    .post-preview {
      width: 100%;
      max-height: 300px;
      border-radius: 8px;
      object-fit: cover;
      margin-bottom: 20px;
    }
    .btn {
      display: block;
      background: #0095f6;
      color: #fff;
      text-decoration: none;
      padding: 12px 24px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 15px;
      margin-bottom: 12px;
      transition: background 0.2s;
    }
    .btn:hover {
      background: #0077c5;
    }
    .btn-secondary {
      background: transparent;
      color: #0095f6;
      border: 1px solid #0095f6;
    }
    .btn-secondary:hover {
      background: rgba(0,149,246,0.05);
    }
  </style>
  <script>
    window.onload = function() {
      var userAgent = navigator.userAgent || navigator.vendor || window.opera;
      var deepLinkUrl = "trave-social://post-detail?id=${postId}";
      
      // Attempt to launch the deep link
      window.location.href = deepLinkUrl;
      
      // Default to iOS App Store
      var storeUrl = "https://apps.apple.com/app/id6760894554";
      
      if (/android/i.test(userAgent)) {
        storeUrl = "https://play.google.com/store/apps/details?id=com.tauhee56.travesocial";
        var iosBtn = document.getElementById("ios-btn");
        if (iosBtn) iosBtn.style.display = "none";
      } else if (/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream) {
        var androidBtn = document.getElementById("android-btn");
        if (androidBtn) androidBtn.style.display = "none";
      }
      
      setTimeout(function() {
        if (!document.hidden) {
          window.location.href = storeUrl;
        }
      }, 2500);
    };
  </script>
</head>
<body>
  <div class="card">
    <img class="avatar" src="https://ui-avatars.com/api/?name=${encodeURIComponent(authorName)}&background=FF8D00&color=fff&size=120" alt="Avatar">
    <h1>Check out ${authorName}'s post on Trips!</h1>
    <p>${caption ? '"' + caption + '"' : 'Shared a new travel moment'}</p>
    ${imageUrl ? '<img class="post-preview" src="' + imageUrl + '" alt="Post Media">' : ''}
    
    <a href="trave-social://post-detail?id=${postId}" class="btn">Open in Trips App</a>
    <a id="ios-btn" href="https://apps.apple.com/app/id6760894554" class="btn btn-secondary" style="margin-bottom: 8px;">Download from App Store</a>
    <a id="android-btn" href="https://play.google.com/store/apps/details?id=com.tauhee56.travesocial" class="btn btn-secondary">Download from Play Store</a>
  </div>
</body>
</html>
    `);
  } catch (err) {
    res.redirect('https://apps.apple.com/app/id6760894554');
  }
});

app.get('/share/story/:id', async (req, res) => {
  const storyId = req.params.id;
  try {
    const Story = mongoose.model('Story');
    const User = mongoose.model('User');
    const story = await Story.findById(storyId);
    let authorName = 'Someone';
    let imageUrl = '';
    let caption = '';
    
    if (story) {
      caption = story.caption || '';
      imageUrl = story.image || story.thumbnail || '';
      const author = await User.findOne({
        $or: [
          { firebaseUid: story.userId },
          { uid: story.userId },
          { _id: mongoose.Types.ObjectId.isValid(story.userId) ? new mongoose.Types.ObjectId(story.userId) : null }
        ]
      });
      if (author) {
        authorName = author.displayName || author.username || author.name || 'Someone';
      }
    }
    
    res.send(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Check out this story on Trips!</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: #fafafa;
      margin: 0;
      padding: 0;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
    }
    .card {
      background: #fff;
      border: 1px solid #dbdbdb;
      border-radius: 12px;
      max-width: 450px;
      width: 90%;
      padding: 24px;
      text-align: center;
      box-shadow: 0 4px 12px rgba(0,0,0,0.05);
    }
    .avatar {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      object-fit: cover;
      background: #eee;
      margin-bottom: 12px;
    }
    h1 {
      font-size: 18px;
      color: #262626;
      margin: 0 0 8px 0;
    }
    p {
      font-size: 14px;
      color: #8e8e8e;
      margin: 0 0 20px 0;
      line-height: 1.4;
    }
    .post-preview {
      width: 100%;
      max-height: 300px;
      border-radius: 8px;
      object-fit: cover;
      margin-bottom: 20px;
    }
    .btn {
      display: block;
      background: #FF8D00;
      color: #fff;
      text-decoration: none;
      padding: 12px 24px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 15px;
      margin-bottom: 12px;
      transition: background 0.2s;
    }
    .btn:hover {
      background: #e07c00;
    }
    .btn-secondary {
      background: transparent;
      color: #FF8D00;
      border: 1px solid #FF8D00;
    }
    .btn-secondary:hover {
      background: rgba(255,141,0,0.05);
    }
  </style>
  <script>
    window.onload = function() {
      var userAgent = navigator.userAgent || navigator.vendor || window.opera;
      var deepLinkUrl = "trave-social://story-detail?id=${storyId}";
      
      // Attempt to launch the deep link
      window.location.href = deepLinkUrl;
      
      // Default to iOS App Store
      var storeUrl = "https://apps.apple.com/app/id6760894554";
      
      if (/android/i.test(userAgent)) {
        storeUrl = "https://play.google.com/store/apps/details?id=com.tauhee56.travesocial";
        var iosBtn = document.getElementById("ios-btn");
        if (iosBtn) iosBtn.style.display = "none";
      } else if (/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream) {
        var androidBtn = document.getElementById("android-btn");
        if (androidBtn) androidBtn.style.display = "none";
      }
      
      setTimeout(function() {
        if (!document.hidden) {
          window.location.href = storeUrl;
        }
      }, 2500);
    };
  </script>
</head>
<body>
  <div class="card">
    <img class="avatar" src="https://ui-avatars.com/api/?name=${encodeURIComponent(authorName)}&background=FF8D00&color=fff&size=120" alt="Avatar">
    <h1>Check out ${authorName}'s story on Trips!</h1>
    <p>${caption ? '"' + caption + '"' : 'Shared a new story moment'}</p>
    ${imageUrl ? '<img class="post-preview" src="' + imageUrl + '" alt="Story Media">' : ''}
    
    <a href="trave-social://story-detail?id=${storyId}" class="btn">Open in Trips App</a>
    <a id="ios-btn" href="https://apps.apple.com/app/id6760894554" class="btn btn-secondary" style="margin-bottom: 8px;">Download from App Store</a>
    <a id="android-btn" href="https://play.google.com/store/apps/details?id=com.tauhee56.travesocial" class="btn btn-secondary">Download from Play Store</a>
  </div>
</body>
</html>
    `);
  } catch (err) {
    res.redirect('https://apps.apple.com/app/id6760894554');
  }
});

// ============= API-PREFIXED SHARE ROUTES =============
// The mobile client dynamically builds share URLs using getAPIBaseURL() which includes /api.
// These aliases redirect to the canonical /share/ routes so the preview page is always served.
app.get('/api/share/post/:id', (req, res) => {
  res.redirect(301, `/share/post/${req.params.id}`);
});
app.get('/api/share/story/:id', (req, res) => {
  res.redirect(301, `/share/story/${req.params.id}`);
});

app.get('/', (req, res) => {
  res.json({ message: 'Trips API is running', version: '1.2.0' });
});

// ============= 404 HANDLER =============
// Must be after all routes
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint not found' });
});

// ============= GLOBAL ERROR HANDLER =============
// Must be last middleware — catches all unhandled errors to prevent process crash
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('🔴 Unhandled Error:', err.stack || err.message);
  // Never leak stack traces or internal details to the client
  res.status(err.status || 500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
  });
});

const initSockets = require('./loaders/socket');

// Start server
let server;
let io;

if (process.env.NODE_ENV !== 'test') {
  server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📡 Local Access: http://localhost:${PORT}`);
  });

  // Initialize Socket.IO
  const JWT_SECRET = process.env.JWT_SECRET;
  io = initSockets(server, JWT_SECRET);
}

// ============= GRACEFUL SHUTDOWN =============
// Properly close connections on deploy/restart to avoid interrupted DB writes
function gracefulShutdown(signal) {
  console.log(`\n⚠️ ${signal} received. Shutting down gracefully...`);
  if (server) {
    server.close(() => {
      console.log('✅ HTTP server closed.');
      if (io) {
        io.close(() => console.log('✅ Socket.IO closed.'));
      }
      mongoose.connection.close(false).then(() => {
        console.log('✅ MongoDB connection closed.');
        process.exit(0);
      }).catch(() => process.exit(0));
    });
  } else {
    mongoose.connection.close(false).then(() => {
      console.log('✅ MongoDB connection closed.');
      process.exit(0);
    }).catch(() => process.exit(0));
  }
  // Force shutdown after 10s if graceful shutdown fails
  setTimeout(() => {
    console.error('🔴 Forced shutdown after timeout.');
    process.exit(1);
  }, 10000);
}

if (process.env.NODE_ENV !== 'test') {
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

// Connect to Database AFTER server/routes are fully loaded to prevent event loop blockage
connectDatabase();

module.exports = server || app;