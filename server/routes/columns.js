const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

// Helper to check column existence and verify board membership
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

// PUT /api/columns/:id - Rename column or update position
router.put('/:id', (req, res) => {
  try {
    const columnId = parseInt(req.params.id, 10);
    if (!columnId || isNaN(columnId)) {
      return res.status(400).json({ error: 'A valid Column ID is required.' });
    }

    const { name, position } = req.body;

    const { column, membership, error, status } = getColumnAndVerifyMembership(columnId, req.user.id);
    if (error) {
      return res.status(status).json({ error });
    }

    // Handle position update if provided
    if (position !== undefined && position !== null) {
      const targetPos = parseInt(position, 10);
      if (isNaN(targetPos) || targetPos < 0) {
        return res.status(400).json({ error: 'Position must be a non-negative integer.' });
      }

      const reorderTx = db.transaction(() => {
        const siblingCols = db.prepare(`
          SELECT id FROM columns 
          WHERE board_id = ? AND id != ?
          ORDER BY position ASC, id ASC
        `).all(column.board_id, columnId);

        const clampedPos = Math.max(0, Math.min(targetPos, siblingCols.length));
        siblingCols.splice(clampedPos, 0, { id: columnId });

        const updatePosStmt = db.prepare('UPDATE columns SET position = ? WHERE id = ?');
        siblingCols.forEach((col, idx) => {
          updatePosStmt.run(idx, col.id);
        });
      });

      reorderTx();
    }

    // Handle name rename if provided
    if (name !== undefined) {
      if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Column name cannot be empty.' });
      }
      const trimmedName = name.trim();
      if (trimmedName.length > 50) {
        return res.status(400).json({ error: 'Column name cannot exceed 50 characters.' });
      }

      db.prepare('UPDATE columns SET name = ? WHERE id = ?').run(trimmedName, columnId);

      // Log activity
      db.prepare('INSERT INTO activity_log (board_id, user_id, action) VALUES (?, ?, ?)').run(
        column.board_id,
        req.user.id,
        `renamed column to "${trimmedName}"`
      );
    }

    const updated = db.prepare('SELECT id, board_id, name, position FROM columns WHERE id = ?').get(columnId);
    return res.status(200).json({ message: 'Column updated successfully.', column: updated });
  } catch (err) {
    console.error('Error updating column:', err);
    return res.status(500).json({ error: 'Failed to update column.' });
  }
});

// PATCH /api/columns/:id/move - Dedicated endpoint for column reordering
router.patch('/:id/move', (req, res) => {
  try {
    const columnId = parseInt(req.params.id, 10);
    if (!columnId || isNaN(columnId)) {
      return res.status(400).json({ error: 'A valid Column ID is required.' });
    }

    const { position } = req.body;
    if (position === undefined || position === null) {
      return res.status(400).json({ error: 'Target position is required.' });
    }

    const targetPos = parseInt(position, 10);
    if (isNaN(targetPos) || targetPos < 0) {
      return res.status(400).json({ error: 'Position must be a non-negative integer.' });
    }

    const { column, membership, error, status } = getColumnAndVerifyMembership(columnId, req.user.id);
    if (error) {
      return res.status(status).json({ error });
    }

    // Re-index all columns of the board within an atomic transaction
    const moveColumnTx = db.transaction(() => {
      const siblingCols = db.prepare(`
        SELECT id FROM columns 
        WHERE board_id = ? AND id != ?
        ORDER BY position ASC, id ASC
      `).all(column.board_id, columnId);

      const clampedPos = Math.max(0, Math.min(targetPos, siblingCols.length));
      siblingCols.splice(clampedPos, 0, { id: columnId });

      const updatePosStmt = db.prepare('UPDATE columns SET position = ? WHERE id = ?');
      siblingCols.forEach((col, idx) => {
        updatePosStmt.run(idx, col.id);
      });
    });

    moveColumnTx();

    const updated = db.prepare('SELECT id, board_id, name, position FROM columns WHERE id = ?').get(columnId);
    return res.status(200).json({
      message: 'Column reordered successfully.',
      column: updated
    });
  } catch (err) {
    console.error('Error reordering column:', err);
    return res.status(500).json({ error: 'Failed to reorder column.' });
  }
});

// DELETE /api/columns/:id - Delete column
// Specification: Column deletion is strictly restricted to the BOARD OWNER
// Policy: If column contains tasks, require explicit force=true confirmation; then cascade-delete tasks in transaction
router.delete('/:id', (req, res) => {
  try {
    const columnId = parseInt(req.params.id, 10);
    if (!columnId || isNaN(columnId)) {
      return res.status(400).json({ error: 'A valid Column ID is required.' });
    }

    const force = req.query.force === 'true';

    const { column, membership, error, status } = getColumnAndVerifyMembership(columnId, req.user.id);
    if (error) {
      return res.status(status).json({ error });
    }

    // STRICT OWNER CHECK: Only the board owner can delete columns!
    if (membership.role !== 'owner') {
      return res.status(403).json({ error: 'Permission denied. Only the board owner can delete columns.' });
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
