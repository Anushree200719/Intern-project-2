const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

// Helper to check membership via column id
function getColumnAndVerifyMembership(columnId, userId) {
  const column = db.prepare('SELECT id, board_id, name, position FROM columns WHERE id = ?').get(columnId);
  if (!column) {
    return { error: 'Column not found.', status: 404 };
  }

  const membership = db.prepare('SELECT role FROM board_members WHERE board_id = ? AND user_id = ?').get(column.board_id, userId);
  if (!membership) {
    return { error: 'Access denied. You are not a member of this board.', status: 403 };
  }

  return { column, membership };
}

// PUT /api/columns/:id - Rename column
router.put('/:id', (req, res) => {
  try {
    const columnId = Number(req.params.id);
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Column name is required.' });
    }

    const { column, membership, error, status } = getColumnAndVerifyMembership(columnId, req.user.id);
    if (error) {
      return res.status(status).json({ error });
    }

    const trimmedName = name.trim();
    db.prepare('UPDATE columns SET name = ? WHERE id = ?').run(trimmedName, columnId);

    // Log activity
    db.prepare('INSERT INTO activity_log (board_id, user_id, action) VALUES (?, ?, ?)').run(
      column.board_id,
      req.user.id,
      `renamed column to "${trimmedName}"`
    );

    const updated = db.prepare('SELECT id, board_id, name, position FROM columns WHERE id = ?').get(columnId);
    return res.status(200).json({ message: 'Column updated successfully.', column: updated });
  } catch (err) {
    console.error('Error updating column:', err);
    return res.status(500).json({ error: 'Failed to update column.' });
  }
});

// DELETE /api/columns/:id - Delete column
// Documented policy: If column contains tasks, require explicit force=true confirmation; then cascade-delete tasks inside a transaction
router.delete('/:id', (req, res) => {
  try {
    const columnId = Number(req.params.id);
    const force = req.query.force === 'true';

    const { column, membership, error, status } = getColumnAndVerifyMembership(columnId, req.user.id);
    if (error) {
      return res.status(status).json({ error });
    }

    // Count tasks in column
    const taskCountRow = db.prepare('SELECT COUNT(*) AS count FROM tasks WHERE column_id = ?').get(columnId);
    const taskCount = taskCountRow ? taskCountRow.count : 0;

    if (taskCount > 0 && !force) {
      return res.status(400).json({
        error: `Column "${column.name}" contains ${taskCount} task(s). Deleting will remove these tasks. Please confirm deletion.`,
        hasTasks: true,
        taskCount
      });
    }

    // Execute deletion and re-index remaining columns
    const deleteTx = db.transaction(() => {
      db.prepare('DELETE FROM columns WHERE id = ?').run(columnId);

      // Re-index remaining columns for clean consecutive ordering
      const remainingCols = db.prepare('SELECT id FROM columns WHERE board_id = ? ORDER BY position ASC, id ASC').all(column.board_id);
      const updatePosStmt = db.prepare('UPDATE columns SET position = ? WHERE id = ?');
      remainingCols.forEach((col, idx) => {
        updatePosStmt.run(idx, col.id);
      });

      // Log activity
      db.prepare('INSERT INTO activity_log (board_id, user_id, action) VALUES (?, ?, ?)').run(
        column.board_id,
        req.user.id,
        `deleted column "${column.name}"${taskCount > 0 ? ` with ${taskCount} task(s)` : ''}`
      );
    });

    deleteTx();

    return res.status(200).json({ message: 'Column deleted successfully.' });
  } catch (err) {
    console.error('Error deleting column:', err);
    return res.status(500).json({ error: 'Failed to delete column.' });
  }
});

module.exports = router;
