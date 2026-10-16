const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken, requireBoardMember, requireBoardOwner } = require('../middleware/auth');

// All board routes require authentication
router.use(authenticateToken);

// GET /api/boards - List all boards accessible to the logged-in user
router.get('/', (req, res) => {
  try {
    const userId = req.user.id;

    const boards = db.prepare(`
      SELECT 
        b.id,
        b.name,
        b.description,
        b.owner_id,
        u.name AS owner_name,
        bm.role,
        b.created_at,
        (SELECT COUNT(*) FROM tasks t WHERE t.board_id = b.id) AS task_count,
        (SELECT COUNT(*) FROM board_members bm2 WHERE bm2.board_id = b.id) AS member_count
      FROM boards b
      JOIN board_members bm ON bm.board_id = b.id
      JOIN users u ON u.id = b.owner_id
      WHERE bm.user_id = ?
      ORDER BY b.created_at DESC
    `).all(userId);

    return res.status(200).json({ boards });
  } catch (err) {
    console.error('Error fetching boards:', err);
    return res.status(500).json({ error: 'Failed to retrieve boards.' });
  }
});

// POST /api/boards - Create a new board with default columns
router.post('/', (req, res) => {
  try {
    const { name, description } = req.body;
    const userId = req.user.id;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Board name is required.' });
    }

    const trimmedName = name.trim();
    const trimmedDesc = description ? description.trim() : null;

    // Execute in transaction: board + owner membership + default columns + activity
    const createBoardTx = db.transaction(() => {
      const boardStmt = db.prepare('INSERT INTO boards (name, description, owner_id) VALUES (?, ?, ?)');
      const boardInfo = boardStmt.run(trimmedName, trimmedDesc, userId);
      const boardId = Number(boardInfo.lastInsertRowid);

      // Add user as owner in board_members
      const memberStmt = db.prepare('INSERT INTO board_members (board_id, user_id, role) VALUES (?, ?, ?)');
      memberStmt.run(boardId, userId, 'owner');

      // Create default 3 columns: To Do, In Progress, Done
      const defaultColumns = ['To Do', 'In Progress', 'Done'];
      const columnStmt = db.prepare('INSERT INTO columns (board_id, name, position) VALUES (?, ?, ?)');
      defaultColumns.forEach((colName, index) => {
        columnStmt.run(boardId, colName, index);
      });

      // Log activity
      const logStmt = db.prepare('INSERT INTO activity_log (board_id, user_id, action) VALUES (?, ?, ?)');
      logStmt.run(boardId, userId, `created board "${trimmedName}"`);

      return boardId;
    });

    const newBoardId = createBoardTx();

    const createdBoard = db.prepare(`
      SELECT b.id, b.name, b.description, b.owner_id, u.name AS owner_name, 'owner' as role, b.created_at
      FROM boards b
      JOIN users u ON u.id = b.owner_id
      WHERE b.id = ?
    `).get(newBoardId);

    return res.status(201).json({
      message: 'Board created successfully.',
      board: createdBoard
    });
  } catch (err) {
    console.error('Error creating board:', err);
    return res.status(500).json({ error: 'Failed to create board.' });
  }
});

// GET /api/boards/:id - Get full board details (columns, tasks, members)
router.get('/:id', requireBoardMember, (req, res) => {
  try {
    const boardId = req.boardId;

    // Get board metadata
    const board = db.prepare(`
      SELECT 
        b.id,
        b.name,
        b.description,
        b.owner_id,
        u.name AS owner_name,
        b.created_at,
        bm.role AS user_role
      FROM boards b
      JOIN users u ON u.id = b.owner_id
      JOIN board_members bm ON bm.board_id = b.id AND bm.user_id = ?
      WHERE b.id = ?
    `).get(req.user.id, boardId);

    if (!board) {
      return res.status(404).json({ error: 'Board not found.' });
    }

    // Get members
    const members = db.prepare(`
      SELECT 
        u.id,
        u.name,
        u.email,
        bm.role,
        bm.created_at AS joined_at
      FROM board_members bm
      JOIN users u ON u.id = bm.user_id
      WHERE bm.board_id = ?
      ORDER BY bm.role DESC, u.name ASC
    `).all(boardId);

    // Get columns
    const columns = db.prepare(`
      SELECT id, board_id, name, position, created_at
      FROM columns
      WHERE board_id = ?
      ORDER BY position ASC, id ASC
    `).all(boardId);

    // Get all tasks for this board
    const tasks = db.prepare(`
      SELECT 
        t.id,
        t.board_id,
        t.column_id,
        t.title,
        t.description,
        t.priority,
        t.due_date,
        t.assignee_id,
        u_assignee.name AS assignee_name,
        u_assignee.email AS assignee_email,
        t.created_by,
        u_creator.name AS creator_name,
        t.position,
        t.created_at,
        t.updated_at,
        (SELECT COUNT(*) FROM comments c WHERE c.task_id = t.id) AS comment_count
      FROM tasks t
      LEFT JOIN users u_assignee ON u_assignee.id = t.assignee_id
      LEFT JOIN users u_creator ON u_creator.id = t.created_by
      WHERE t.board_id = ?
      ORDER BY t.position ASC, t.id ASC
    `).all(boardId);

    // Group tasks by column_id
    const columnsWithTasks = columns.map(col => ({
      ...col,
      tasks: tasks.filter(task => task.column_id === col.id)
    }));

    return res.status(200).json({
      board: {
        ...board,
        members,
        columns: columnsWithTasks
      }
    });
  } catch (err) {
    console.error('Error retrieving board details:', err);
    return res.status(500).json({ error: 'Failed to retrieve board details.' });
  }
});

// PUT /api/boards/:id - Update board name & description (owner only)
router.put('/:id', requireBoardMember, requireBoardOwner, (req, res) => {
  try {
    const boardId = req.boardId;
    const { name, description } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Board name is required.' });
    }

    const trimmedName = name.trim();
    const trimmedDesc = description ? description.trim() : null;

    db.prepare('UPDATE boards SET name = ?, description = ? WHERE id = ?').run(trimmedName, trimmedDesc, boardId);

    // Log activity
    db.prepare('INSERT INTO activity_log (board_id, user_id, action) VALUES (?, ?, ?)').run(
      boardId,
      req.user.id,
      `renamed board to "${trimmedName}"`
    );

    const updated = db.prepare('SELECT id, name, description, owner_id, created_at FROM boards WHERE id = ?').get(boardId);
    return res.status(200).json({ message: 'Board updated successfully.', board: updated });
  } catch (err) {
    console.error('Error updating board:', err);
    return res.status(500).json({ error: 'Failed to update board.' });
  }
});

// DELETE /api/boards/:id - Delete board (owner only)
router.delete('/:id', requireBoardMember, requireBoardOwner, (req, res) => {
  try {
    const boardId = req.boardId;
    db.prepare('DELETE FROM boards WHERE id = ?').run(boardId);
    return res.status(200).json({ message: 'Board deleted successfully.' });
  } catch (err) {
    console.error('Error deleting board:', err);
    return res.status(500).json({ error: 'Failed to delete board.' });
  }
});

// POST /api/boards/:id/members - Invite registered user by email (owner only)
router.post('/:id/members', requireBoardMember, requireBoardOwner, (req, res) => {
  try {
    const boardId = req.boardId;
    const { email } = req.body;

    if (!email || !email.trim()) {
      return res.status(400).json({ error: 'User email is required.' });
    }

    const trimmedEmail = email.trim().toLowerCase();

    // Find registered user
    const userToInvite = db.prepare('SELECT id, name, email FROM users WHERE email = ?').get(trimmedEmail);
    if (!userToInvite) {
      return res.status(404).json({ error: `User with email "${trimmedEmail}" is not registered on TaskBoard.` });
    }

    // Check if already a member
    const existing = db.prepare('SELECT id FROM board_members WHERE board_id = ? AND user_id = ?').get(boardId, userToInvite.id);
    if (existing) {
      return res.status(400).json({ error: `${userToInvite.name} is already a member of this board.` });
    }

    // Add member
    db.prepare('INSERT INTO board_members (board_id, user_id, role) VALUES (?, ?, ?)').run(boardId, userToInvite.id, 'member');

    // Log activity
    db.prepare('INSERT INTO activity_log (board_id, user_id, action) VALUES (?, ?, ?)').run(
      boardId,
      req.user.id,
      `added ${userToInvite.name} to the board`
    );

    return res.status(201).json({
      message: `${userToInvite.name} added to the board successfully.`,
      member: {
        id: userToInvite.id,
        name: userToInvite.name,
        email: userToInvite.email,
        role: 'member'
      }
    });
  } catch (err) {
    console.error('Error adding member:', err);
    return res.status(500).json({ error: 'Failed to add member to board.' });
  }
});

// DELETE /api/boards/:id/members/:userId - Remove member from board (owner only)
router.delete('/:id/members/:userId', requireBoardMember, requireBoardOwner, (req, res) => {
  try {
    const boardId = req.boardId;
    const targetUserId = Number(req.params.userId);

    if (targetUserId === req.user.id) {
      return res.status(400).json({ error: 'As board owner, you cannot remove yourself from your board.' });
    }

    const targetUser = db.prepare('SELECT name FROM users WHERE id = ?').get(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const membership = db.prepare('SELECT id, role FROM board_members WHERE board_id = ? AND user_id = ?').get(boardId, targetUserId);
    if (!membership) {
      return res.status(404).json({ error: 'User is not a member of this board.' });
    }

    // Transaction: delete membership + unassign tasks
    const removeMemberTx = db.transaction(() => {
      db.prepare('DELETE FROM board_members WHERE board_id = ? AND user_id = ?').run(boardId, targetUserId);
      db.prepare('UPDATE tasks SET assignee_id = NULL WHERE board_id = ? AND assignee_id = ?').run(boardId, targetUserId);
      db.prepare('INSERT INTO activity_log (board_id, user_id, action) VALUES (?, ?, ?)').run(
        boardId,
        req.user.id,
        `removed ${targetUser.name} from the board`
      );
    });

    removeMemberTx();

    return res.status(200).json({ message: `${targetUser.name} removed from the board.` });
  } catch (err) {
    console.error('Error removing member:', err);
    return res.status(500).json({ error: 'Failed to remove member.' });
  }
});

// POST /api/boards/:id/columns - Add a new column
router.post('/:id/columns', requireBoardMember, (req, res) => {
  try {
    const boardId = req.boardId;
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Column name is required.' });
    }

    const trimmedName = name.trim();

    // Calculate next position
    const maxPosRow = db.prepare('SELECT MAX(position) AS max_pos FROM columns WHERE board_id = ?').get(boardId);
    const nextPos = (maxPosRow && maxPosRow.max_pos !== null) ? maxPosRow.max_pos + 1 : 0;

    const info = db.prepare('INSERT INTO columns (board_id, name, position) VALUES (?, ?, ?)').run(
      boardId,
      trimmedName,
      nextPos
    );

    const newColumn = {
      id: Number(info.lastInsertRowid),
      board_id: boardId,
      name: trimmedName,
      position: nextPos,
      tasks: []
    };

    // Log activity
    db.prepare('INSERT INTO activity_log (board_id, user_id, action) VALUES (?, ?, ?)').run(
      boardId,
      req.user.id,
      `added column "${trimmedName}"`
    );

    return res.status(201).json({
      message: 'Column created successfully.',
      column: newColumn
    });
  } catch (err) {
    console.error('Error creating column:', err);
    return res.status(500).json({ error: 'Failed to create column.' });
  }
});

// GET /api/boards/:id/tasks - Search and filter tasks
router.get('/:id/tasks', requireBoardMember, (req, res) => {
  try {
    const boardId = req.boardId;
    const { q, priority, assignee } = req.query;

    let sql = `
      SELECT 
        t.id,
        t.board_id,
        t.column_id,
        t.title,
        t.description,
        t.priority,
        t.due_date,
        t.assignee_id,
        u_assignee.name AS assignee_name,
        u_assignee.email AS assignee_email,
        t.created_by,
        u_creator.name AS creator_name,
        t.position,
        t.created_at,
        t.updated_at,
        (SELECT COUNT(*) FROM comments c WHERE c.task_id = t.id) AS comment_count
      FROM tasks t
      LEFT JOIN users u_assignee ON u_assignee.id = t.assignee_id
      LEFT JOIN users u_creator ON u_creator.id = t.created_by
      WHERE t.board_id = ?
    `;

    const params = [boardId];

    if (q && q.trim()) {
      sql += ' AND (t.title LIKE ? OR t.description LIKE ?)';
      params.push(`%${q.trim()}%`, `%${q.trim()}%`);
    }

    if (priority && priority !== 'all') {
      sql += ' AND t.priority = ?';
      params.push(priority.toLowerCase());
    }

    if (assignee) {
      if (assignee === 'me') {
        sql += ' AND t.assignee_id = ?';
        params.push(req.user.id);
      } else if (assignee === 'unassigned') {
        sql += ' AND t.assignee_id IS NULL';
      } else if (!isNaN(Number(assignee))) {
        sql += ' AND t.assignee_id = ?';
        params.push(Number(assignee));
      }
    }

    sql += ' ORDER BY t.position ASC, t.id ASC';

    const tasks = db.prepare(sql).all(...params);
    return res.status(200).json({ tasks });
  } catch (err) {
    console.error('Error filtering tasks:', err);
    return res.status(500).json({ error: 'Failed to filter tasks.' });
  }
});

// GET /api/boards/:id/activity - Get recent board activity log
router.get('/:id/activity', requireBoardMember, (req, res) => {
  try {
    const boardId = req.boardId;
    const activities = db.prepare(`
      SELECT 
        a.id,
        a.action,
        a.created_at,
        u.name AS user_name,
        u.email AS user_email
      FROM activity_log a
      JOIN users u ON u.id = a.user_id
      WHERE a.board_id = ?
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT 30
    `).all(boardId);

    return res.status(200).json({ activities });
  } catch (err) {
    console.error('Error retrieving activity log:', err);
    return res.status(500).json({ error: 'Failed to retrieve activity log.' });
  }
});

module.exports = router;
