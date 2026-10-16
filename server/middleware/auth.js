const jwt = require('jsonwebtoken');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'taskboard_default_secret_key_change_in_production';

// Authenticate user via JWT in Authorization header
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No authentication token provided.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(decoded.id);

    if (!user) {
      return res.status(401).json({ error: 'User associated with token no longer exists.' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token. Please log in again.' });
  }
}

// Ensure the logged-in user is a member or owner of the board
function requireBoardMember(req, res, next) {
  const boardId = req.params.boardId || req.params.id;

  if (!boardId) {
    return res.status(400).json({ error: 'Board ID is required.' });
  }

  const membership = db.prepare(`
    SELECT role FROM board_members 
    WHERE board_id = ? AND user_id = ?
  `).get(boardId, req.user.id);

  if (!membership) {
    return res.status(403).json({ error: 'Access denied. You are not a member of this board.' });
  }

  req.boardMembership = membership;
  req.boardId = Number(boardId);
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
  JWT_SECRET
};
