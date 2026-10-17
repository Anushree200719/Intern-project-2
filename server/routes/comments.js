const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { isPositiveInteger, parsePositiveInteger } = require('../utils/validation');

router.use(authenticateToken);

// POST /api/tasks/:taskId/comments - Add comment to task
router.post('/task/:taskId', (req, res) => {
  try {
    if (!isPositiveInteger(req.params.taskId)) {
      return res.status(400).json({ error: 'A valid positive Task ID is required.' });
    }

    const taskId = parsePositiveInteger(req.params.taskId);

    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ error: 'Invalid request body.' });
    }

    const { content } = req.body;

    if (typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'Comment content cannot be empty and must be a string.' });
    }

    const trimmedContent = content.trim();
    if (trimmedContent.length > 2000) {
      return res.status(400).json({ error: 'Comment content cannot exceed 2000 characters.' });
    }

    // Verify task exists and user has board access
    const task = db.prepare('SELECT id, board_id, title FROM tasks WHERE id = ?').get(taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found.' });
    }

    const membership = db.prepare('SELECT id FROM board_members WHERE board_id = ? AND user_id = ?').get(task.board_id, req.user.id);
    if (!membership) {
      return res.status(403).json({ error: 'Access denied. You are not a member of this board.' });
    }

    let newCommentId;

    const addCommentTx = db.transaction(() => {
      const stmt = db.prepare('INSERT INTO comments (task_id, user_id, content) VALUES (?, ?, ?)');
      const info = stmt.run(taskId, req.user.id, trimmedContent);
      newCommentId = Number(info.lastInsertRowid);

      // Log activity
      db.prepare('INSERT INTO activity_log (board_id, task_id, user_id, action) VALUES (?, ?, ?, ?)').run(
        task.board_id,
        taskId,
        req.user.id,
        `commented on task "${task.title}"`
      );
    });

    addCommentTx();

    const createdComment = db.prepare(`
      SELECT 
        c.id,
        c.task_id,
        c.user_id,
        c.content,
        c.created_at,
        u.name AS author_name,
        u.email AS author_email
      FROM comments c
      JOIN users u ON u.id = c.user_id
      WHERE c.id = ?
    `).get(newCommentId);

    return res.status(201).json({
      message: 'Comment added successfully.',
      comment: createdComment
    });
  } catch (err) {
    console.error('Error adding comment:', err.message || err);
    return res.status(500).json({ error: 'Failed to add comment.' });
  }
});

// DELETE /api/comments/:id - Delete comment (author only)
router.delete('/:id', (req, res) => {
  try {
    if (!isPositiveInteger(req.params.id)) {
      return res.status(400).json({ error: 'A valid positive Comment ID is required.' });
    }

    const commentId = parsePositiveInteger(req.params.id);

    const comment = db.prepare('SELECT id, task_id, user_id FROM comments WHERE id = ?').get(commentId);
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found.' });
    }

    // Strict ownership verification: only author can delete their comment
    if (comment.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Permission denied. You can only delete your own comments.' });
    }

    const deleteCommentTx = db.transaction(() => {
      db.prepare('DELETE FROM comments WHERE id = ?').run(commentId);
    });

    deleteCommentTx();

    return res.status(200).json({ message: 'Comment deleted successfully.' });
  } catch (err) {
    console.error('Error deleting comment:', err.message || err);
    return res.status(500).json({ error: 'Failed to delete comment.' });
  }
});

module.exports = router;
