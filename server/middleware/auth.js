const jwt = require('jsonwebtoken');
const db = require('../db');

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim().length < 16) {
    throw new Error('Fatal Security Configuration: A strong JWT_SECRET environment variable (at least 16 characters) is required.');
  }
  return secret.trim();
}

// Authenticate user via JWT in Authorization header
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

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
  const boardId = parseInt(rawId, 10);

  if (!boardId || isNaN(boardId)) {
    return res.status(400).json({ error: 'A valid Board ID is required.' });
  }

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
