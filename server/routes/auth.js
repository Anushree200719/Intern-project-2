const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { authenticateToken, getJwtSecret } = require('../middleware/auth');
const { loginLimiter, registerLimiter } = require('../middleware/rateLimit');
const { isValidEmail, isValidString } = require('../utils/validation');

// POST /api/auth/register
router.post('/register', registerLimiter, async (req, res) => {
  try {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ error: 'Invalid request body.' });
    }

    const { name, email, password, confirmPassword } = req.body;

    if (
      typeof name !== 'string' ||
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      typeof confirmPassword !== 'string'
    ) {
      return res.status(400).json({ error: 'All fields must be valid strings.' });
    }

    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();

    if (trimmedName.length < 2 || trimmedName.length > 80) {
      return res.status(400).json({ error: 'Full name must be between 2 and 80 characters.' });
    }

    if (!isValidEmail(trimmedEmail)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    if (password.length < 6 || password.length > 128) {
      return res.status(400).json({ error: 'Password must be between 6 and 128 characters long.' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match.' });
    }

    // Check if email already exists
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(trimmedEmail);
    if (existing) {
      return res.status(400).json({ error: 'An account with this email address already exists.' });
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Insert user
    const insertStmt = db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)');
    const info = insertStmt.run(trimmedName, trimmedEmail, passwordHash);

    const newUser = {
      id: Number(info.lastInsertRowid),
      name: trimmedName,
      email: trimmedEmail
    };

    // Generate JWT token
    const token = jwt.sign(
      { id: newUser.id, email: newUser.email },
      getJwtSecret(),
      { expiresIn: '7d' }
    );

    return res.status(201).json({
      message: 'Account registered successfully.',
      token,
      user: newUser
    });
  } catch (err) {
    console.error('Registration error:', err.message || err);
    return res.status(500).json({ error: 'An unexpected error occurred during registration.' });
  }
});

// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res) => {
  try {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ error: 'Invalid request body.' });
    }

    const { email, password } = req.body;

    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Email and password must be valid strings.' });
    }

    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    if (trimmedEmail.length > 255 || password.length > 128) {
      return res.status(400).json({ error: 'Invalid email or password length.' });
    }

    // Query user
    const user = db.prepare('SELECT id, name, email, password_hash FROM users WHERE email = ?').get(trimmedEmail);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email },
      getJwtSecret(),
      { expiresIn: '7d' }
    );

    return res.status(200).json({
      message: 'Login successful.',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    });
  } catch (err) {
    console.error('Login error:', err.message || err);
    return res.status(500).json({ error: 'An unexpected error occurred during login.' });
  }
});

// GET /api/auth/me
router.get('/me', authenticateToken, (req, res) => {
  return res.status(200).json({ user: req.user });
});

// GET /api/auth/users (search registered users by email or name to invite)
router.get('/users', authenticateToken, (req, res) => {
  let query = '%';
  if (req.query && req.query.q !== undefined) {
    if (typeof req.query.q !== 'string') {
      return res.status(400).json({ error: 'Search query must be a string.' });
    }
    const trimmed = req.query.q.trim();
    if (trimmed.length > 100) {
      return res.status(400).json({ error: 'Search query cannot exceed 100 characters.' });
    }
    query = `%${trimmed}%`;
  }

  const users = db.prepare(`
    SELECT id, name, email 
    FROM users 
    WHERE (name LIKE ? OR email LIKE ?)
    LIMIT 10
  `).all(query, query);

  return res.status(200).json({ users });
});

module.exports = router;
