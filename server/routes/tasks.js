const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

// Helper to verify task existence and user membership
function getTaskAndVerifyMembership(taskId, userId) {
  const task = db.prepare(`
    SELECT t.*, c.name AS column_name, b.name AS board_name, b.owner_id
    FROM tasks t
    JOIN columns c ON c.id = t.column_id
    JOIN boards b ON b.id = t.board_id
    WHERE t.id = ?
  `).get(taskId);

  if (!task) {
    return { error: 'Task not found.', status: 404 };
  }

  const membership = db.prepare('SELECT role FROM board_members WHERE board_id = ? AND user_id = ?').get(task.board_id, userId);
  if (!membership) {
    return { error: 'Access denied. You are not a member of this board.', status: 403 };
  }

  return { task, membership };
}

// POST /api/columns/:columnId/tasks - Create a new task in column
router.post('/column/:columnId', (req, res) => {
  try {
    const columnId = Number(req.params.columnId);
    const { title, description, priority, due_date, assignee_id } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Task title is required.' });
    }

    const column = db.prepare('SELECT id, board_id, name FROM columns WHERE id = ?').get(columnId);
    if (!column) {
      return res.status(404).json({ error: 'Column not found.' });
    }

    // Verify user is member of board
    const membership = db.prepare('SELECT role FROM board_members WHERE board_id = ? AND user_id = ?').get(column.board_id, req.user.id);
    if (!membership) {
      return res.status(403).json({ error: 'Access denied. You are not a member of this board.' });
    }

    // Validate assignee if provided (must be member of this board)
    let validAssigneeId = null;
    if (assignee_id) {
      const isAssigneeMember = db.prepare('SELECT id FROM board_members WHERE board_id = ? AND user_id = ?').get(column.board_id, assignee_id);
      if (!isAssigneeMember) {
        return res.status(400).json({ error: 'Assignee must be a registered member of this board.' });
      }
      validAssigneeId = Number(assignee_id);
    }

    // Validate priority
    const allowedPriorities = ['low', 'medium', 'high'];
    const validPriority = priority && allowedPriorities.includes(priority.toLowerCase()) ? priority.toLowerCase() : 'medium';

    // Calculate position at end of column
    const maxPosRow = db.prepare('SELECT MAX(position) AS max_pos FROM tasks WHERE column_id = ?').get(columnId);
    const nextPos = (maxPosRow && maxPosRow.max_pos !== null) ? maxPosRow.max_pos + 1 : 0;

    const trimmedTitle = title.trim();
    const trimmedDesc = description ? description.trim() : null;
    const validDueDate = due_date && due_date.trim() !== '' ? due_date : null;

    let newTaskId;
    const createTaskTx = db.transaction(() => {
      const stmt = db.prepare(`
        INSERT INTO tasks (board_id, column_id, title, description, priority, due_date, assignee_id, created_by, position)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const info = stmt.run(
        column.board_id,
        columnId,
        trimmedTitle,
        trimmedDesc,
        validPriority,
        validDueDate,
        validAssigneeId,
        req.user.id,
        nextPos
      );
      newTaskId = Number(info.lastInsertRowid);

      // Log activity
      db.prepare('INSERT INTO activity_log (board_id, task_id, user_id, action) VALUES (?, ?, ?, ?)').run(
        column.board_id,
        newTaskId,
        req.user.id,
        `created task "${trimmedTitle}" in ${column.name}`
      );
    });

    createTaskTx();

    const createdTask = db.prepare(`
      SELECT 
        t.*,
        u_assignee.name AS assignee_name,
        u_assignee.email AS assignee_email,
        u_creator.name AS creator_name,
        0 AS comment_count
      FROM tasks t
      LEFT JOIN users u_assignee ON u_assignee.id = t.assignee_id
      LEFT JOIN users u_creator ON u_creator.id = t.created_by
      WHERE t.id = ?
    `).get(newTaskId);

    return res.status(201).json({
      message: 'Task created successfully.',
      task: createdTask
    });
  } catch (err) {
    console.error('Error creating task:', err);
    return res.status(500).json({ error: 'Failed to create task.' });
  }
});

// GET /api/tasks/:id - Get task detail with comments
router.get('/:id', (req, res) => {
  try {
    const taskId = Number(req.params.id);
    const { task, error, status } = getTaskAndVerifyMembership(taskId, req.user.id);
    if (error) {
      return res.status(status).json({ error });
    }

    const taskDetail = db.prepare(`
      SELECT 
        t.*,
        u_assignee.name AS assignee_name,
        u_assignee.email AS assignee_email,
        u_creator.name AS creator_name,
        c.name AS column_name
      FROM tasks t
      LEFT JOIN users u_assignee ON u_assignee.id = t.assignee_id
      LEFT JOIN users u_creator ON u_creator.id = t.created_by
      JOIN columns c ON c.id = t.column_id
      WHERE t.id = ?
    `).get(taskId);

    const comments = db.prepare(`
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
      WHERE c.task_id = ?
      ORDER BY c.created_at ASC
    `).all(taskId);

    return res.status(200).json({
      task: {
        ...taskDetail,
        comments
      }
    });
  } catch (err) {
    console.error('Error retrieving task detail:', err);
    return res.status(500).json({ error: 'Failed to retrieve task.' });
  }
});

// PUT /api/tasks/:id - Update task fields
router.put('/:id', (req, res) => {
  try {
    const taskId = Number(req.params.id);
    const { title, description, priority, due_date, assignee_id } = req.body;

    const { task, error, status } = getTaskAndVerifyMembership(taskId, req.user.id);
    if (error) {
      return res.status(status).json({ error });
    }

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Task title is required.' });
    }

    // Validate assignee if provided
    let validAssigneeId = null;
    if (assignee_id) {
      const isAssigneeMember = db.prepare('SELECT id FROM board_members WHERE board_id = ? AND user_id = ?').get(task.board_id, assignee_id);
      if (!isAssigneeMember) {
        return res.status(400).json({ error: 'Assignee must be a registered member of this board.' });
      }
      validAssigneeId = Number(assignee_id);
    }

    const allowedPriorities = ['low', 'medium', 'high'];
    const validPriority = priority && allowedPriorities.includes(priority.toLowerCase()) ? priority.toLowerCase() : 'medium';
    const trimmedTitle = title.trim();
    const trimmedDesc = description ? description.trim() : null;
    const validDueDate = due_date && due_date.trim() !== '' ? due_date : null;

    db.prepare(`
      UPDATE tasks 
      SET title = ?, description = ?, priority = ?, due_date = ?, assignee_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(trimmedTitle, trimmedDesc, validPriority, validDueDate, validAssigneeId, taskId);

    // Log activity
    db.prepare('INSERT INTO activity_log (board_id, task_id, user_id, action) VALUES (?, ?, ?, ?)').run(
      task.board_id,
      taskId,
      req.user.id,
      `updated task "${trimmedTitle}"`
    );

    const updatedTask = db.prepare(`
      SELECT 
        t.*,
        u_assignee.name AS assignee_name,
        u_assignee.email AS assignee_email,
        u_creator.name AS creator_name,
        (SELECT COUNT(*) FROM comments c WHERE c.task_id = t.id) AS comment_count
      FROM tasks t
      LEFT JOIN users u_assignee ON u_assignee.id = t.assignee_id
      LEFT JOIN users u_creator ON u_creator.id = t.created_by
      WHERE t.id = ?
    `).get(taskId);

    return res.status(200).json({
      message: 'Task updated successfully.',
      task: updatedTask
    });
  } catch (err) {
    console.error('Error updating task:', err);
    return res.status(500).json({ error: 'Failed to update task.' });
  }
});

// PATCH /api/tasks/:id/move - Move task to a new column and/or position (Drag-and-Drop & Accessibility Move)
router.patch('/:id/move', (req, res) => {
  try {
    const taskId = Number(req.params.id);
    const { column_id, position } = req.body;

    if (column_id === undefined || position === undefined) {
      return res.status(400).json({ error: 'Target column_id and position are required.' });
    }

    const targetColumnId = Number(column_id);
    const targetPosition = Math.max(0, parseInt(position, 10));

    const { task, error, status } = getTaskAndVerifyMembership(taskId, req.user.id);
    if (error) {
      return res.status(status).json({ error });
    }

    // Verify target column exists and belongs to the same board
    const targetColumn = db.prepare('SELECT id, board_id, name FROM columns WHERE id = ?').get(targetColumnId);
    if (!targetColumn) {
      return res.status(404).json({ error: 'Target column not found.' });
    }

    if (targetColumn.board_id !== task.board_id) {
      return res.status(400).json({ error: 'Target column does not belong to the same board.' });
    }

    const sourceColumnId = task.column_id;
    const isDifferentColumn = sourceColumnId !== targetColumnId;

    // Transactional Reordering Algorithm
    const moveTaskTx = db.transaction(() => {
      const updatePositionStmt = db.prepare('UPDATE tasks SET position = ? WHERE id = ?');
      const updateColumnAndPosStmt = db.prepare('UPDATE tasks SET column_id = ?, position = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');

      if (!isDifferentColumn) {
        // Reordering within the SAME column
        const siblingTasks = db.prepare(`
          SELECT id FROM tasks 
          WHERE column_id = ? AND id != ?
          ORDER BY position ASC, id ASC
        `).all(sourceColumnId, taskId);

        // Splice task at targetPosition
        siblingTasks.splice(targetPosition, 0, { id: taskId });

        // Update positions 0..N
        siblingTasks.forEach((t, idx) => {
          updatePositionStmt.run(idx, t.id);
        });
      } else {
        // Moving to a DIFFERENT column
        // 1. Re-index remaining tasks in source column
        const sourceSiblings = db.prepare(`
          SELECT id FROM tasks 
          WHERE column_id = ? AND id != ?
          ORDER BY position ASC, id ASC
        `).all(sourceColumnId, taskId);

        sourceSiblings.forEach((t, idx) => {
          updatePositionStmt.run(idx, t.id);
        });

        // 2. Fetch target column tasks
        const targetSiblings = db.prepare(`
          SELECT id FROM tasks 
          WHERE column_id = ?
          ORDER BY position ASC, id ASC
        `).all(targetColumnId);

        // Insert task at targetPosition
        targetSiblings.splice(targetPosition, 0, { id: taskId });

        // Update all tasks in target column
        targetSiblings.forEach((t, idx) => {
          if (t.id === taskId) {
            updateColumnAndPosStmt.run(targetColumnId, idx, taskId);
          } else {
            updatePositionStmt.run(idx, t.id);
          }
        });

        // Log column change activity
        db.prepare('INSERT INTO activity_log (board_id, task_id, user_id, action) VALUES (?, ?, ?, ?)').run(
          task.board_id,
          taskId,
          req.user.id,
          `moved task "${task.title}" to ${targetColumn.name}`
        );
      }
    });

    moveTaskTx();

    const updatedTask = db.prepare(`
      SELECT 
        t.*,
        u_assignee.name AS assignee_name,
        u_assignee.email AS assignee_email,
        u_creator.name AS creator_name,
        c.name AS column_name,
        (SELECT COUNT(*) FROM comments c WHERE c.task_id = t.id) AS comment_count
      FROM tasks t
      LEFT JOIN users u_assignee ON u_assignee.id = t.assignee_id
      LEFT JOIN users u_creator ON u_creator.id = t.created_by
      JOIN columns c ON c.id = t.column_id
      WHERE t.id = ?
    `).get(taskId);

    return res.status(200).json({
      message: 'Task moved successfully.',
      task: updatedTask
    });
  } catch (err) {
    console.error('Error moving task:', err);
    return res.status(500).json({ error: 'Failed to move task.' });
  }
});

// DELETE /api/tasks/:id - Delete task
router.delete('/:id', (req, res) => {
  try {
    const taskId = Number(req.params.id);
    const { task, error, status } = getTaskAndVerifyMembership(taskId, req.user.id);
    if (error) {
      return res.status(status).json({ error });
    }

    const deleteTaskTx = db.transaction(() => {
      db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);

      // Re-index remaining tasks in column
      const remainingTasks = db.prepare(`
        SELECT id FROM tasks 
        WHERE column_id = ? 
        ORDER BY position ASC, id ASC
      `).all(task.column_id);

      const updatePosStmt = db.prepare('UPDATE tasks SET position = ? WHERE id = ?');
      remainingTasks.forEach((t, idx) => {
        updatePosStmt.run(idx, t.id);
      });

      // Log activity
      db.prepare('INSERT INTO activity_log (board_id, user_id, action) VALUES (?, ?, ?)').run(
        task.board_id,
        req.user.id,
        `deleted task "${task.title}"`
      );
    });

    deleteTaskTx();

    return res.status(200).json({ message: 'Task deleted successfully.' });
  } catch (err) {
    console.error('Error deleting task:', err);
    return res.status(500).json({ error: 'Failed to delete task.' });
  }
});

module.exports = router;
