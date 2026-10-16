-- TaskBoard Seed Data
-- Passwords for all sample users are: password123

PRAGMA foreign_keys = ON;

-- Clean existing data
DELETE FROM activity_log;
DELETE FROM comments;
DELETE FROM tasks;
DELETE FROM columns;
DELETE FROM board_members;
DELETE FROM boards;
DELETE FROM users;

-- 1. Insert Users
INSERT INTO users (id, name, email, password_hash, created_at) VALUES
(1, 'Alex Morgan', 'alex@taskboard.local', '$2a$10$DtHB/cZPWoLb5gHhDmETvetDkDXHTH4gIBmUW4nEIgN9/.Wk1HWg.', datetime('now', '-7 days')),
(2, 'Sam Taylor', 'sam@taskboard.local', '$2a$10$DtHB/cZPWoLb5gHhDmETvetDkDXHTH4gIBmUW4nEIgN9/.Wk1HWg.', datetime('now', '-6 days')),
(3, 'Jordan Lee', 'jordan@taskboard.local', '$2a$10$DtHB/cZPWoLb5gHhDmETvetDkDXHTH4gIBmUW4nEIgN9/.Wk1HWg.', datetime('now', '-5 days'));

-- 2. Insert Board
INSERT INTO boards (id, name, description, owner_id, created_at) VALUES
(1, 'Sprint 14 - Web App Launch', 'Q4 Core Deliverables, API Integrations, and Production Release', 1, datetime('now', '-5 days'));

-- 3. Insert Board Members
INSERT INTO board_members (id, board_id, user_id, role, created_at) VALUES
(1, 1, 1, 'owner', datetime('now', '-5 days')),
(2, 1, 2, 'member', datetime('now', '-4 days')),
(3, 1, 3, 'member', datetime('now', '-4 days'));

-- 4. Insert Columns
INSERT INTO columns (id, board_id, name, position, created_at) VALUES
(1, 1, 'To Do', 0, datetime('now', '-5 days')),
(2, 1, 'In Progress', 1, datetime('now', '-5 days')),
(3, 1, 'Done', 2, datetime('now', '-5 days'));

-- 5. Insert Tasks
INSERT INTO tasks (id, board_id, column_id, title, description, priority, due_date, assignee_id, created_by, position, created_at, updated_at) VALUES
(1, 1, 1, 'Implement User Settings & Profile Menu', 'Allow users to update their display name, notification preferences, and toggle dark mode.', 'low', date('now', '+14 days'), 3, 1, 0, datetime('now', '-4 days'), datetime('now', '-4 days')),
(2, 1, 1, 'Set up Redis Caching for Hot Board Queries', 'Add in-memory cache layer for frequent board read requests to reduce DB roundtrips.', 'medium', date('now', '+10 days'), 2, 1, 1, datetime('now', '-3 days'), datetime('now', '-3 days')),
(3, 1, 1, 'Security Audit: Penetration Testing on JWT Endpoints', 'Audit token expiration, CORS headers, brute-force limits, and SQL injection safety.', 'high', date('now', '-2 days'), 1, 1, 2, datetime('now', '-4 days'), datetime('now', '-4 days')),

(4, 1, 2, 'Refactor Drag & Drop State with Optimistic UI', 'Improve vanilla JS HTML5 drag-and-drop feedback, drop indicator lines, and auto-rollback on network errors.', 'high', date('now', '+5 days'), 1, 1, 0, datetime('now', '-2 days'), datetime('now', '-1 days')),
(5, 1, 2, 'Design Dark Mode Color Palette & CSS Variables', 'Select modern accessible HSL tokens for slate dark background, card borders, and vibrant accents.', 'medium', date('now', '+3 days'), 3, 2, 1, datetime('now', '-2 days'), datetime('now', '-2 days')),
(6, 1, 2, 'Export Board Activity Logs to CSV/JSON', 'Provide downloadable activity audit trail for project managers and viva evaluation.', 'low', date('now', '+12 days'), 2, 1, 2, datetime('now', '-1 days'), datetime('now', '-1 days')),

(7, 1, 3, 'Setup Express Server & SQLite Database Schema', 'Configure better-sqlite3 with foreign keys, transaction support, and normalized schema.', 'high', date('now', '-3 days'), 1, 1, 0, datetime('now', '-5 days'), datetime('now', '-3 days')),
(8, 1, 3, 'Implement JWT Authentication & Password Hashing', 'Add bcrypt password encryption and JWT authorization middleware for secure API routes.', 'high', date('now', '-1 days'), 2, 1, 1, datetime('now', '-5 days'), datetime('now', '-2 days'));

-- 6. Insert Comments
INSERT INTO comments (id, task_id, user_id, content, created_at) VALUES
(1, 4, 2, 'Started implementing HTML5 dragenter/dragover event handling. Reorder indices calculate cleanly.', datetime('now', '-1 days', '-2 hours')),
(2, 4, 1, 'Great progress! Make sure positions recalculate inside an atomic transaction on the backend.', datetime('now', '-1 days', '-1 hours')),
(3, 3, 1, 'High priority item is overdue - scheduling a dedicated security review this Friday.', datetime('now', '-4 hours')),
(4, 7, 1, 'Schema verified with PRAGMA foreign_keys = ON and cascading deletes.', datetime('now', '-3 days'));

-- 7. Insert Activity Log
INSERT INTO activity_log (id, board_id, task_id, user_id, action, created_at) VALUES
(1, 1, NULL, 1, 'created board "Sprint 14 - Web App Launch"', datetime('now', '-5 days')),
(2, 1, NULL, 1, 'added Sam Taylor to the board', datetime('now', '-4 days')),
(3, 1, NULL, 1, 'added Jordan Lee to the board', datetime('now', '-4 days')),
(4, 1, 7, 1, 'created task "Setup Express Server & SQLite Database Schema"', datetime('now', '-5 days')),
(5, 1, 7, 1, 'moved task "Setup Express Server & SQLite Database Schema" to Done', datetime('now', '-3 days')),
(6, 1, 8, 2, 'moved task "Implement JWT Authentication & Password Hashing" to Done', datetime('now', '-2 days')),
(7, 1, 4, 1, 'moved task "Refactor Drag & Drop State with Optimistic UI" to In Progress', datetime('now', '-1 days'));
