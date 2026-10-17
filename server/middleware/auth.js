const jwt = require('jsonwebtoken');
const db = require('../db');
const { isPositiveInteger, parsePositiveInteger } = require('../utils/validation');

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || typeof secret !== 'string' || secret.trim().length < 16) {
    throw new Error('Fatal Security Configuration: A strong JWT_SECRET environment variable (at least 16 characters) is required.');
  }

  const trimmed = secret.trim();

  if (process.env.NODE_ENV === 'production') {
    const knownWeak = [
      'secret',
      'jwt_secret',
      'replace_with_a_secure_random_string_at_least_32_characters_long',
      'taskboard_jwt_secret_internship_demo_2026_secure_key',
      'your-secret-key',
      'changeme',
      'password'
    ];
    if (trimmed.length < 32 || knownWeak.includes(trimmed.toLowerCase())) {
      throw new Error('Fatal Security Configuration: In production, JWT_SECRET must be at least 32 characters long and cannot be a default or placeholder secret.');
    }
  }

  return trimmed;
}

// Authenticate user via JWT in Authorization header
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : null;

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No authentication token provided.' });
  }

  let jwtSecret;
  try {
    jwtSecret = getJwtSecret();
  } catch (secErr) {
    console.error('Authentication configuration error:', secErr.message);
    return res.status(500).json({ error: 'Authentication service configuration error.' });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret);
    if (!decoded || typeof decoded !== 'object' || !decoded.id) {
      return res.status(401).json({ error: 'Invalid or malformed authentication token.' });
    }

    const user = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(decoded.id);

    if (!user) {
      return res.status(401).json({ error: 'User associated with token no longer exists.' });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }
    return res.status(401).json({ error: 'Invalid or malformed authentication token.' });
  }
}

// Ensure the logged-in user is a member or owner of the board
function requireBoardMember(req, res, next) {
  const rawId = req.params.boardId || req.params.id;
  if (!isPositiveInteger(rawId)) {
    return res.status(400).json({ error: 'A valid Board ID is required.' });
  }

  const boardId = parsePositiveInteger(rawId);

  const membership = db.prepare(`
    SELECT role FROM board_members 
    WHERE board_id = ? AND user_id = ?
  `).get(boardId, req.user.id);

  if (!membership) {
    const boardExists = db.prepare('SELECT id FROM boards WHERE id = ?').get(boardId);
    if (!boardExists) {
      return res.status(404).json({ error: 'Board not found.' });
    }
    return res.status(403).json({ error: 'Access denied. You are not a member of this board.' });
  }

  req.boardMembership = membership;
  req.boardId = boardId;
  next();
}

// Ensure the logged-in user is the owner of the board
function requireBoardOwner(req, res, next) {
  if (!req.boardMembership || req.boardMembership.role !== 'owner') {
    return res.status(403).json({ error: 'Permission denied. Only the board owner can perform this action.' });
  }
  next();
}

module.exports = {
  authenticateToken,
  requireBoardMember,
  requireBoardOwner,
  getJwtSecret
};
