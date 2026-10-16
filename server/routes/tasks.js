const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

// Helper to verify task existence and user membership
function getTaskAndVerifyMembership(taskId, userId) {
  const parsedId = parseInt(taskId, 10);
  if (!parsedId || isNaN(parsedId)) {
    return { error: 'A valid Task ID is required.', status: 400 };
  }

  const task = db.prepare(`
    SELECT t.*, c.name AS column_name, b.name AS board_name, b.owner_id
    FROM tasks t
    JOIN columns c ON c.id = t.column_id
    JOIN boards b ON b.id = t.board_id
    WHERE t.id = ?
  `).get(parsedId);

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
    const columnId = parseInt(req.params.columnId, 10);
    if (!columnId || isNaN(columnId)) {
      return res.status(400).json({ error: 'A valid Column ID is required.' });
    }

    const { title, description, priority, due_date, assignee_id } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Task title is required.' });
    }

    const trimmedTitle = title.trim();
    if (trimmedTitle.length > 150) {
      return res.status(400).json({ error: 'Task title cannot exceed 150 characters.' });
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
    if (assignee_id !== undefined && assignee_id !== null && assignee_id !== '') {
      const parsedAssignee = parseInt(assignee_id, 10);
      if (isNaN(parsedAssignee)) {
        return res.status(400).json({ error: 'Assignee ID must be a valid integer.' });
      }
      const isAssigneeMember = db.prepare('SELECT id FROM board_members WHERE board_id = ? AND user_id = ?').get(column.board_id, parsedAssignee);
      if (!isAssigneeMember) {
        return res.status(400).json({ error: 'Assignee must be a registered member of this board.' });
      }
      validAssigneeId = parsedAssignee;
    }

    // Validate priority
    const allowedPriorities = ['low', 'medium', 'high'];
    let validPriority = 'medium';
    if (priority !== undefined && priority !== null) {
      const p = String(priority).toLowerCase().trim();
      if (!allowedPriorities.includes(p)) {
        return res.status(400).json({ error: "Invalid priority value. Must be 'low', 'medium', or 'high'." });
      }
      validPriority = p;
    }

    // Validate due date
    let validDueDate = null;
    if (due_date !== undefined && due_date !== null && due_date.trim() !== '') {
      const parsedTime = Date.parse(due_date);
      if (isNaN(parsedTime)) {
        return res.status(400).json({ error: 'Invalid due date format. Please provide a valid date (YYYY-MM-DD).' });
      }
      validDueDate = due_date.trim();
    }

    // Calculate position at end of column
    const maxPosRow = db.prepare('SELECT MAX(position) AS max_pos FROM tasks WHERE column_id = ?').get(columnId);
    const nextPos = (maxPosRow && maxPosRow.max_pos !== null) ? maxPosRow.max_pos + 1 : 0;

    const trimmedDesc = description ? description.trim() : null;

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
    const { task, error, status } = getTaskAndVerifyMembership(req.params.id, req.user.id);
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
    `).get(task.id);

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
    `).all(task.id);

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
    const { task, error, status } = getTaskAndVerifyMembership(req.params.id, req.user.id);
    if (error) {
      return res.status(status).json({ error });
    }

    const { title, description, priority, due_date, assignee_id } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Task title is required.' });
    }

    const trimmedTitle = title.trim();
    if (trimmedTitle.length > 150) {
      return res.status(400).json({ error: 'Task title cannot exceed 150 characters.' });
    }

    // Validate assignee if provided
    let validAssigneeId = null;
    if (assignee_id !== undefined && assignee_id !== null && assignee_id !== '') {
      const parsedAssignee = parseInt(assignee_id, 10);
      if (isNaN(parsedAssignee)) {
        return res.status(400).json({ error: 'Assignee ID must be a valid integer.' });
      }
      const isAssigneeMember = db.prepare('SELECT id FROM board_members WHERE board_id = ? AND user_id = ?').get(task.board_id, parsedAssignee);
      if (!isAssigneeMember) {
        return res.status(400).json({ error: 'Assignee must be a registered member of this board.' });
      }
      validAssigneeId = parsedAssignee;
    }

    // Validate priority
    const allowedPriorities = ['low', 'medium', 'high'];
    let validPriority = task.priority;
    if (priority !== undefined && priority !== null) {
      const p = String(priority).toLowerCase().trim();
      if (!allowedPriorities.includes(p)) {
        return res.status(400).json({ error: "Invalid priority value. Must be 'low', 'medium', or 'high'." });
      }
      validPriority = p;
    }

    // Validate due date
    let validDueDate = null;
    if (due_date !== undefined && due_date !== null && due_date.trim() !== '') {
      const parsedTime = Date.parse(due_date);
      if (isNaN(parsedTime)) {
        return res.status(400).json({ error: 'Invalid due date format. Please provide a valid date (YYYY-MM-DD).' });
      }
      validDueDate = due_date.trim();
    }

    const trimmedDesc = description ? description.trim() : null;

    db.prepare(`
      UPDATE tasks 
      SET title = ?, description = ?, priority = ?, due_date = ?, assignee_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(trimmedTitle, trimmedDesc, validPriority, validDueDate, validAssigneeId, task.id);

    // Log activity
    db.prepare('INSERT INTO activity_log (board_id, task_id, user_id, action) VALUES (?, ?, ?, ?)').run(
      task.board_id,
      task.id,
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
    `).get(task.id);

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
    const { task, error, status } = getTaskAndVerifyMembership(req.params.id, req.user.id);
    if (error) {
      return res.status(status).json({ error });
    }

    const { column_id, position } = req.body;

    if (column_id === undefined || position === undefined) {
      return res.status(400).json({ error: 'Target column_id and position are required.' });
    }

    const targetColumnId = parseInt(column_id, 10);
    const targetPosition = parseInt(position, 10);

    if (isNaN(targetColumnId)) {
      return res.status(400).json({ error: 'A valid target column_id is required.' });
    }

    if (isNaN(targetPosition) || targetPosition < 0) {
      return res.status(400).json({ error: 'Position must be a non-negative integer.' });
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
        `).all(sourceColumnId, task.id);

        const clampedPos = Math.max(0, Math.min(targetPosition, siblingTasks.length));
        siblingTasks.splice(clampedPos, 0, { id: task.id });

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
        `).all(sourceColumnId, task.id);

        sourceSiblings.forEach((t, idx) => {
          updatePositionStmt.run(idx, t.id);
        });

        // 2. Fetch target column tasks
        const targetSiblings = db.prepare(`
          SELECT id FROM tasks 
          WHERE column_id = ?
          ORDER BY position ASC, id ASC
        `).all(targetColumnId);

        const clampedPos = Math.max(0, Math.min(targetPosition, targetSiblings.length));
        targetSiblings.splice(clampedPos, 0, { id: task.id });

        targetSiblings.forEach((t, idx) => {
          if (t.id === task.id) {
            updateColumnAndPosStmt.run(targetColumnId, idx, task.id);
          } else {
            updatePositionStmt.run(idx, t.id);
          }
        });

        // Log column change activity
        db.prepare('INSERT INTO activity_log (board_id, task_id, user_id, action) VALUES (?, ?, ?, ?)').run(
          task.board_id,
          task.id,
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
    `).get(task.id);

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
    const { task, error, status } = getTaskAndVerifyMembership(req.params.id, req.user.id);
    if (error) {
      return res.status(status).json({ error });
    }

    const deleteTaskTx = db.transaction(() => {
      db.prepare('DELETE FROM tasks WHERE id = ?').run(task.id);

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
      db.prepare('INSERT INTO activity_log (board_id, task_id, user_id, action) VALUES (?, ?, ?, ?)').run(
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
