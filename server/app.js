const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { getJwtSecret } = require('./middleware/auth');

// Ensure required security configuration is present
function validateSecurityConfiguration() {
  const isTest = process.env.NODE_ENV === 'test';
  try {
    getJwtSecret();
  } catch (err) {
    console.error(`FATAL SECURITY CONFIGURATION: ${err.message} Refusing to start.`);
    if (!isTest) process.exit(1);
    throw err;
  }
}

validateSecurityConfiguration();

// Ensure DB is initialized
require('./db');

const authRoutes = require('./routes/auth');
const boardsRoutes = require('./routes/boards');
const columnsRoutes = require('./routes/columns');
const tasksRoutes = require('./routes/tasks');
const commentsRoutes = require('./routes/comments');

const app = express();
const PORT = process.env.PORT || 3000;

// Reverse Proxy Trust Configuration:
// Proxy headers MUST NOT be trusted unless the deployment explicitly configures trusted proxies.
const trustProxyEnv = process.env.TRUST_PROXY;
if (trustProxyEnv === 'true' || trustProxyEnv === '1') {
  app.set('trust proxy', 1);
} else if (trustProxyEnv && trustProxyEnv.trim() !== 'false' && trustProxyEnv.trim() !== '0') {
  app.set('trust proxy', trustProxyEnv.trim());
} else {
  app.set('trust proxy', false);
}

// Environment-based CORS Configuration
const allowedOriginsEnv = process.env.CORS_ALLOWED_ORIGINS || process.env.CORS_ORIGIN;
let corsOptions;

if (allowedOriginsEnv && allowedOriginsEnv.trim()) {
  const allowedOrigins = allowedOriginsEnv.split(',').map(o => o.trim()).filter(Boolean);
  corsOptions = {
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g., mobile apps, curl, server-side fetch)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Origin blocked by CORS policy.'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  };
} else {
  // Local development default: allow localhost/127.0.0.1 or same-origin
  corsOptions = {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
      if (isLocalhost || process.env.NODE_ENV !== 'production') {
        callback(null, true);
      } else {
        callback(new Error('Origin blocked by CORS policy in production. Configure CORS_ALLOWED_ORIGINS.'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  };
}

app.use(cors(corsOptions));

// Security Headers Middleware with tuned Content Security Policy
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self'; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "img-src 'self' data:; " +
    "connect-src 'self'; " +
    "frame-ancestors 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self';"
  );
  next();
});

// Body Parsing Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend assets
app.use(express.static(path.join(__dirname, '..', 'public')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/boards', boardsRoutes);
app.use('/api/columns', columnsRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/comments', commentsRoutes);

// Compatibility route shortcuts to fulfill all REST conventions
// Allow POST /api/columns/:id/tasks directly
app.post('/api/columns/:id/tasks', (req, res, next) => {
  req.url = `/column/${req.params.id}`;
  tasksRoutes(req, res, next);
});

// Allow POST /api/tasks/:id/comments directly
app.post('/api/tasks/:id/comments', (req, res, next) => {
  req.url = `/task/${req.params.id}`;
  commentsRoutes(req, res, next);
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Root route redirect to dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'dashboard.html'));
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found.' });
});

// Global error handler
app.use((err, req, res, next) => {
  if (err.message && err.message.includes('CORS')) {
    return res.status(403).json({ error: err.message });
  }
  console.error('Unhandled server error:', err.message || err);
  res.status(500).json({ error: 'Internal server error.' });
});

// Start server if not imported
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`TaskBoard Server running at http://localhost:${PORT}`);
    console.log(`- Dashboard: http://localhost:${PORT}/dashboard.html`);
    console.log(`- Login:     http://localhost:${PORT}/login.html`);
  });
}

module.exports = app;
