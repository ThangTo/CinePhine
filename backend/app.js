const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const redisService = require('./services/redis.service');

const app = express();

const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('./models/user.model');
const cookieParser = require('cookie-parser');
const authService = require('./services/auth.service');
const { getGoogleCallbackUrl } = require('./utils/authUtils');
const { optionalAuth } = require('./middleware/auth.middleware');
const { trackingMiddleware } = require('./middleware/analytics.middleware');

// Compression middleware - Nén responses để giảm bandwidth
app.use(
  compression({
    filter: (req, res) => {
      // Don't compress SSE responses
      if (req.headers.accept === 'text/event-stream') return false;
      if (req.path.includes('/chat/stream')) return false;
      if (req.path.includes('/thumbnails/process')) return false;
      if (req.path.includes('/update-episodes')) return false;
      if (req.path.includes('/update-quality')) return false;
      if (req.path.includes('/crawl/by-page')) return false;
      if (req.path.includes('/tiktok/download-segment')) return false;
      // Use default filter for other requests
      return compression.filter(req, res);
    },
  }),
);

// Trust proxy - for rate limiting by IP
app.set('trust proxy', true);

// CORS middleware
const allowedOrigins = [
  process.env.CLIENT_URL,
  process.env.CLIENT_URL_LOCAL || 'http://localhost:5001',
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) return callback(null, true);

      if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    optionsSuccessStatus: 200,
  }),
);

// Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Cookie parser
app.use(cookieParser());

// Optional auth middleware
app.use(optionalAuth);

// Analytics tracking middleware (should run AFTER optionalAuth to identify user)
app.use(trackingMiddleware);

// Rate limiting
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const INTERNAL_PROXY_PATHS = ['/movies/proxy-m3u8', '/movies/proxy-ts'];

function getRequestHost(req) {
  const host = req.get('host') || '';
  return host.replace(/:\d+$/, '').toLowerCase();
}

function isInternalStreamingProxyRequest(req) {
  const host = getRequestHost(req);
  return (
    LOOPBACK_HOSTS.has(host) &&
    INTERNAL_PROXY_PATHS.some((proxyPath) => (req.path || '').startsWith(proxyPath))
  );
}

const createRateLimiter = (windowMs, max, message) => {
  // RedisStore works if Redis client has sendCommand — both TCP and REST clients support this
  const store =
    redisService.isConnected && redisService.client
      ? new RedisStore({
          sendCommand: (...args) => {
            // TCP mode: client.sendCommand(args) expects array
            // REST mode: client.sendCommand(args) also expects array
            return redisService.client.sendCommand(args);
          },
        })
      : undefined;

  return rateLimit({
    store,
    windowMs,
    max,
    message: { error: message },
    passOnStoreError: true,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      if (req.user && req.user._id) return `user:${req.user._id}`;
      const forwardedFor = req.headers['x-forwarded-for'];
      if (forwardedFor) return forwardedFor.split(',')[0].trim();
      return req.ip || req.connection.remoteAddress || 'unknown';
    },
    skip: (req) =>
      req.path === '/' ||
      req.path === '/health' ||
      isInternalStreamingProxyRequest(req),
  });
};

const apiLimiter = createRateLimiter(
  15 * 60 * 1000,
  process.env.RATE_LIMIT_MAX || 600,
  'Too many requests, please try again later.',
);

const authLimiter = createRateLimiter(
  15 * 60 * 1000,
  process.env.RATE_LIMIT_MAX_AUTH || 10,
  'Too many login attempts, please try again later.',
);

const chatLimiter = createRateLimiter(
  60 * 1000,
  process.env.RATE_LIMIT_MAX_CHAT || 10,
  'Bạn gửi tin nhắn quá nhanh, vui lòng thử lại sau ít phút.',
);

// Apply rate limiting
app.use('/api/v1/', apiLimiter);
// app.post (not app.use) so req.path keeps the full path and the limiter's skip('/') does not fire.
app.post(['/api/v1/chat', '/api/v1/chat/stream'], chatLimiter);
app.use('/api/v1/auth/login', authLimiter);
app.use('/api/v1/auth/register', authLimiter);

// Logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(
    morgan('combined', {
      skip: (req, res) => res.statusCode < 400,
    }),
  );
}

// Passport initialization
app.use(passport.initialize());

// Serve static avatar files
app.use('/api/v1/avatars', express.static(path.join(__dirname, 'data/avatars')));

// Serve generated subtitle VTT files
const vttCachePath = path.join(__dirname, 'temp_output', 'vtt_cache');
if (!fs.existsSync(vttCachePath)) {
  fs.mkdirSync(vttCachePath, { recursive: true });
}
app.use('/subtitles/:language', (req, res, next) => {
  const filePath = path.resolve(vttCachePath, `.${req.path}`);
  if (!filePath.startsWith(path.resolve(vttCachePath) + path.sep)) {
    return res.status(400).json({ error: 'Invalid subtitle path' });
  }

  if (req.path.endsWith('.vtt') && fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf-8');
    
    // Ensure it starts with WEBVTT followed by at least one blank line
    if (!content.startsWith('WEBVTT')) {
      content = 'WEBVTT\n\n' + content.trimStart();
      fs.writeFileSync(filePath, content, 'utf-8');
    } else if (!content.startsWith('WEBVTT\n\n') && !content.startsWith('WEBVTT\r\n\r\n')) {
      // Fix cases where WEBVTT header exists but blank line is missing
      content = content.replace(/^WEBVTT\s*/, 'WEBVTT\n\n');
      fs.writeFileSync(filePath, content, 'utf-8');
    }

    res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*'); // Ensure CORS for tracks
    return res.status(200).send(content);
  }
  next();
});

passport.use(new LocalStrategy({ usernameField: 'email' }, User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

const apiBaseUrl =
  process.env.GOOGLE_CALLBACK_BASE_URL ||
  process.env.API_BASE_URL ||
  `http://localhost:${process.env.PORT || 5000}`;

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: getGoogleCallbackUrl(apiBaseUrl),
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const authResult = await authService.loginWithGoogleProfile(profile);
          return done(null, authResult);
        } catch (error) {
          return done(error, null);
        }
      },
    ),
  );
}

// Cache middleware
const { cacheMiddleware } = require('./middleware/cache.middleware');

// Routes
const movieRoutes = require('./routes/movie.routes');
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const adminRoutes = require('./routes/admin.routes');
const crawlerRoutes = require('./routes/crawler.routes');
const commentRoutes = require('./routes/comment.routes');
const chatRoutes = require('./routes/chat.routes');
const notificationRoutes = require('./routes/notification.routes');
const castRoutes = require('./routes/cast.routes');
const paymentRoutes = require('./routes/payment.routes');
const viralClipRoutes = require('./routes/viralClip.routes');
const aiRoutes = require('./routes/ai.routes');
const mailboxRoutes = require('./routes/mailbox.routes');
const leaderboardRoutes = require('./routes/leaderboard.routes');
const cursorEffectRoutes = require('./routes/cursorEffect.routes');
const questRoutes = require('./routes/quest.routes');
const adminController = require('./controllers/admin.controller');

// API endpoints with caching
app.use('/api/v1/movies/trending', cacheMiddleware(600));
app.use('/api/v1/movies/top-rated', cacheMiddleware(600));
app.use('/api/v1/movies/new-releases', cacheMiddleware(300));
app.use('/api/v1/movies/meta/top-genres', cacheMiddleware(1800));
app.use('/api/v1/movies/meta/theme', cacheMiddleware(1800));

app.use('/api/v1/movies', movieRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/users/leaderboard', leaderboardRoutes);
app.use('/api/v1/admin', adminRoutes);

// ===== PUBLIC PRICING ROUTES (no auth required) =====
// GET /api/v1/settings/coin-packages — anyone can read coin packages
app.get('/api/v1/settings/coin-packages', adminController.getCoinPackages);

// GET /api/v1/settings/premium-plans — anyone can read premium plans
app.get('/api/v1/settings/premium-plans', adminController.getPremiumPlans);

// GET /api/v1/settings/features — anyone can read feature permissions
app.get('/api/v1/settings/features', adminController.getFeaturePermissions);

// GET /api/v1/settings/payment-status — anyone can read the global payment toggle
app.get('/api/v1/settings/payment-status', adminController.getPaymentConfig);
app.use('/api/v1/crawl', crawlerRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/cast', castRoutes);
app.use('/api/v1/payment', paymentRoutes);
app.use('/api/v1', viralClipRoutes);

// Debug: Log all requests to comments
app.use('/api/v1/comments', (req, res, next) => {
  console.log(`[App] Comments route accessed: ${req.method} ${req.path}`);
  next();
});
app.use('/api/v1/comments', commentRoutes);
app.use('/api/v1/chat', chatRoutes);
app.use('/api/v1/ai', aiRoutes);
app.use('/api/v1/mailbox', mailboxRoutes);
app.use('/api/v1/cursor-effects', cursorEffectRoutes);
app.use('/api/v1/quests', questRoutes);

// Health check endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

app.get('/health', async (req, res) => {
  // Redis live test
  let redisStatus = 'disconnected';
  let redisLatency = null;
  let redisError = null;

  if (redisService.isConnected && redisService.client) {
    try {
      const start = Date.now();
      await redisService.client.ping();
      redisLatency = Date.now() - start;
      redisStatus = 'connected';
    } catch (err) {
      redisStatus = 'error';
      redisError = err.message;
    }
  } else if (process.env.REDIS_URL) {
    // Try fresh connection to capture exact error
    try {
      const redis = require('redis');
      const testClient = redis.createClient({
        url: process.env.REDIS_URL,
        socket: { connectTimeout: 10000, reconnectStrategy: false },
      });
      const start = Date.now();
      await testClient.connect();
      const pong = await testClient.ping();
      redisLatency = Date.now() - start;
      redisStatus = 'fresh_connect_ok';
      redisError = 'Singleton was disconnected but fresh connection works — possible startup race condition';
      await testClient.quit();
    } catch (err) {
      redisStatus = 'connection_failed';
      redisError = err.message;
      if (err.code) redisError += ` [code: ${err.code}]`;
      if (err.cause) redisError += ` [cause: ${err.cause.message || err.cause}]`;
    }
  }

  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    pid: process.pid,
    redis: {
      status: redisStatus,
      mode: redisService.mode,
      latencyMs: redisLatency,
      urlConfigured: !!process.env.REDIS_URL || !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN),
      protocol: process.env.REDIS_URL ? process.env.REDIS_URL.split('://')[0] : (process.env.UPSTASH_REDIS_REST_URL ? 'https (REST)' : null),
      error: redisError,
    },
  });
});

module.exports = app;
