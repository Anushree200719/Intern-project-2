const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// Ensure required security configuration is present
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.trim().length < 16) {
  console.error('FATAL SECURITY CONFIGURATION: JWT_SECRET environment variable is missing or insecure (< 16 characters). Refusing to start.');
  if (process.env.NODE_ENV !== 'test') {
    process.exit(1);
  }
}

// Ensure DB is initialized
require('./db');

const authRoutes = require('./routes/auth');
const boardsRoutes = require('./routes/boards');
const columnsRoutes = require('./routes/columns');
const tasksRoutes = require('./routes/tasks');
const commentsRoutes = require('./routes/comments');

const app = express();
const PORT = process.env.PORT || 3000;

// Security & Parsing Middleware
app.use(cors());
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
  console.error('Unhandled server error:', err);
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
