const http = require('http');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');

// 1. Configure isolated disposable test database & test port
const TEST_DB_PATH = path.join(__dirname, 'data', 'taskboard_test_disposable.db');
const TEST_PORT = 3199;
process.env.DB_PATH = TEST_DB_PATH;
process.env.JWT_SECRET = 'taskboard_test_suite_super_secure_secret_2026';
process.env.PORT = String(TEST_PORT);
process.env.NODE_ENV = 'test';

// Clean any previous test db
[TEST_DB_PATH, `${TEST_DB_PATH}-wal`, `${TEST_DB_PATH}-shm`].forEach(f => {
  if (fs.existsSync(f)) try { fs.unlinkSync(f); } catch (e) {}
});

// Load DB & App after setting environment variables
const db = require('./server/db');
const seedDatabase = require('./server/seed');
const app = require('./server/app');

// Seed test database
seedDatabase({ reset: true });

let server;

function request(method, reqPath, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'localhost',
      port: TEST_PORT,
      path: reqPath,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    };

    const req = http.request(options, (res) => {
      let responseBody = '';
      res.on('data', chunk => responseBody += chunk);
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(responseBody); } catch (e) { parsed = responseBody; }
        resolve({ status: res.statusCode, body: parsed });
      });
    });

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

async function runTestSuite() {
  server = app.listen(TEST_PORT, async () => {
    console.log(`\n======================================================`);
    console.log(` TaskBoard Automated Test Suite (Isolated Test DB)`);
    console.log(`======================================================\n`);

    let passedCount = 0;
    let failedCount = 0;

    async function test(name, fn) {
      process.stdout.write(`• ${name}... `);
      try {
        await fn();
        console.log(`✅ PASS`);
        passedCount++;
      } catch (err) {
        console.log(`❌ FAIL`);
        console.error(`  Error: ${err.message}`);
        failedCount++;
      }
    }

    try {
      let alexToken, samToken, outsiderToken;

      // ==========================================
      // SECTION 1: AUTHENTICATION TESTS
      // ==========================================
      console.log(`\n--- 1. Authentication & Token Verification ---`);

      await test('Health check returns 200 OK', async () => {
        const res = await request('GET', '/api/health');
        assert(res.status === 200, `Expected 200, got ${res.status}`);
      });

      await test('Successful login for seed owner (Alex Morgan)', async () => {
        const res = await request('POST', '/api/auth/login', {
          email: 'alex@taskboard.local',
          password: 'password123'
        });
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        assert(res.body.token, 'Token not received');
        alexToken = res.body.token;
      });

      await test('Successful login for seed member (Sam Taylor)', async () => {
        const res = await request('POST', '/api/auth/login', {
          email: 'sam@taskboard.local',
          password: 'password123'
        });
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        assert(res.body.token, 'Token not received');
        samToken = res.body.token;
      });

      await test('Login rejection for incorrect password (401)', async () => {
        const res = await request('POST', '/api/auth/login', {
          email: 'alex@taskboard.local',
          password: 'wrongpassword'
        });
        assert(res.status === 401, `Expected 401, got ${res.status}`);
      });

      await test('Login rejection for non-existent user (401)', async () => {
        const res = await request('POST', '/api/auth/login', {
          email: 'nonexistent@taskboard.local',
          password: 'password123'
        });
        assert(res.status === 401, `Expected 401, got ${res.status}`);
      });

      await test('Successful registration of a new user', async () => {
        const res = await request('POST', '/api/auth/register', {
          name: 'Outsider User',
          email: 'outsider@taskboard.local',
          password: 'password123',
          confirmPassword: 'password123'
        });
        assert(res.status === 201, `Expected 201, got ${res.status}`);
        assert(res.body.token, 'Token not received');
        outsiderToken = res.body.token;
      });

      await test('Duplicate registration rejection (400)', async () => {
        const res = await request('POST', '/api/auth/register', {
          name: 'Outsider Duplicate',
          email: 'outsider@taskboard.local',
          password: 'password123',
          confirmPassword: 'password123'
        });
        assert(res.status === 400, `Expected 400, got ${res.status}`);
      });

      await test('Missing token rejection on protected route (401)', async () => {
        const res = await request('GET', '/api/boards');
        assert(res.status === 401, `Expected 401, got ${res.status}`);
      });

      await test('Invalid / malformed token rejection (401)', async () => {
        const res = await request('GET', '/api/boards', null, 'invalid.token.structure');
        assert(res.status === 401, `Expected 401, got ${res.status}`);
      });

      await test('Expired token rejection (401)', async () => {
        const expiredToken = jwt.sign({ id: 1, email: 'alex@taskboard.local' }, process.env.JWT_SECRET, { expiresIn: '0s' });
        const res = await request('GET', '/api/boards', null, expiredToken);
        assert(res.status === 401, `Expected 401, got ${res.status}`);
      });

      // ==========================================
      // SECTION 2: AUTHORIZATION & PERMISSIONS
      // ==========================================
      console.log(`\n--- 2. Role-Based Authorization & Permissions ---`);

      let boardId = 1;

      await test('Non-member cannot access private board (403)', async () => {
        const res = await request('GET', `/api/boards/${boardId}`, null, outsiderToken);
        assert(res.status === 403, `Expected 403, got ${res.status}`);
      });

      await test('Non-owner cannot rename board (403)', async () => {
        const res = await request('PUT', `/api/boards/${boardId}`, { name: 'Hacked Board' }, samToken);
        assert(res.status === 403, `Expected 403, got ${res.status}`);
      });

      await test('Non-owner cannot delete board (403)', async () => {
        const res = await request('DELETE', `/api/boards/${boardId}`, null, samToken);
        assert(res.status === 403, `Expected 403, got ${res.status}`);
      });

      await test('Non-owner cannot invite members (403)', async () => {
        const res = await request('POST', `/api/boards/${boardId}/members`, { email: 'outsider@taskboard.local' }, samToken);
        assert(res.status === 403, `Expected 403, got ${res.status}`);
      });

      await test('Board owner can invite existing registered user (201)', async () => {
        const res = await request('POST', `/api/boards/${boardId}/members`, { email: 'outsider@taskboard.local' }, alexToken);
        assert(res.status === 201, `Expected 201, got ${res.status}`);
      });

      await test('Inviting user not registered returns 404', async () => {
        const res = await request('POST', `/api/boards/${boardId}/members`, { email: 'nobody_here@test.com' }, alexToken);
        assert(res.status === 404, `Expected 404, got ${res.status}`);
      });

      await test('Ordinary member CANNOT delete column (403 Forbidden)', async () => {
        const res = await request('DELETE', '/api/columns/1', null, samToken);
        assert(res.status === 403, `Expected 403 Forbidden, got ${res.status}`);
      });

      await test('Board owner can delete an empty column (200)', async () => {
        // Create an empty test column first
        const createColRes = await request('POST', `/api/boards/${boardId}/columns`, { name: 'Temp Col' }, alexToken);
        assert(createColRes.status === 201, 'Column creation failed');
        const colId = createColRes.body.column.id;

        // Owner deletes it
        const delRes = await request('DELETE', `/api/columns/${colId}`, null, alexToken);
        assert(delRes.status === 200, `Expected 200, got ${delRes.status}`);
      });

      await test('Column deletion with tasks requires confirmation (?force=true)', async () => {
        // Column 1 has 3 tasks in seed
        const unforcedRes = await request('DELETE', '/api/columns/1', null, alexToken);
        assert(unforcedRes.status === 400 && unforcedRes.body.hasTasks, `Expected 400 with hasTasks, got ${unforcedRes.status}`);
      });

      await test('Task assignee must be a member of the board (400 if not)', async () => {
        // Remove outsider from board first
        const outsiderUser = db.prepare('SELECT id FROM users WHERE email = ?').get('outsider@taskboard.local');
        await request('DELETE', `/api/boards/${boardId}/members/${outsiderUser.id}`, null, alexToken);

        const res = await request('POST', '/api/columns/1/tasks', {
          title: 'Illegal Assignment Task',
          assignee_id: outsiderUser.id
        }, alexToken);
        assert(res.status === 400, `Expected 400, got ${res.status}`);
      });

      await test('Only comment author can delete their comment (403 for other member, 200 for author)', async () => {
        // Sam posts comment
        const postComment = await request('POST', '/api/tasks/4/comments', { content: 'Sam comment' }, samToken);
        assert(postComment.status === 201, 'Comment post failed');
        const commentId = postComment.body.comment.id;

        // Alex tries to delete Sam comment -> 403
        const unauthorizedDel = await request('DELETE', `/api/comments/${commentId}`, null, alexToken);
        assert(unauthorizedDel.status === 403, `Expected 403, got ${unauthorizedDel.status}`);

        // Sam deletes own comment -> 200
        const authorizedDel = await request('DELETE', `/api/comments/${commentId}`, null, samToken);
        assert(authorizedDel.status === 200, `Expected 200, got ${authorizedDel.status}`);
      });

      // ==========================================
      // SECTION 3: COLUMN & TASK ORDERING
      // ==========================================
      console.log(`\n--- 3. Column and Task Ordering Verification ---`);

      await test('Column reordering: move column to new position', async () => {
        // Move column 1 to position 2
        const res = await request('PATCH', '/api/columns/1/move', { position: 2 }, alexToken);
        assert(res.status === 200, `Expected 200, got ${res.status}`);

        // Verify ordering in DB
        const cols = db.prepare('SELECT id, position FROM columns WHERE board_id = ? ORDER BY position ASC').all(boardId);
        assert(cols.every((c, idx) => c.position === idx), 'Positions are not contiguous 0..N');
      });

      await test('Task move within same column updates positions in transaction', async () => {
        // Move task 1 to position 2 in column 1
        const res = await request('PATCH', '/api/tasks/1/move', { column_id: 1, position: 2 }, alexToken);
        assert(res.status === 200, `Expected 200, got ${res.status}`);

        const tasksInCol = db.prepare('SELECT id, position FROM tasks WHERE column_id = 1 ORDER BY position ASC').all();
        assert(tasksInCol.every((t, idx) => t.position === idx), 'Positions are not contiguous 0..N');
      });

      await test('Task move to different column updates both columns in transaction', async () => {
        // Move task 1 to column 2 position 0
        const res = await request('PATCH', '/api/tasks/1/move', { column_id: 2, position: 0 }, alexToken);
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        assert(res.body.task.column_id === 2, 'Task column_id did not update');

        const col1Tasks = db.prepare('SELECT id, position FROM tasks WHERE column_id = 1 ORDER BY position ASC').all();
        const col2Tasks = db.prepare('SELECT id, position FROM tasks WHERE column_id = 2 ORDER BY position ASC').all();
        assert(col1Tasks.every((t, idx) => t.position === idx), 'Col 1 positions not contiguous');
        assert(col2Tasks.every((t, idx) => t.position === idx), 'Col 2 positions not contiguous');
      });

      await test('Reject task move to column belonging to another board (400)', async () => {
        // Create second board
        const b2Res = await request('POST', '/api/boards', { name: 'Board Two' }, alexToken);
        assert(b2Res.status === 201, 'Board 2 create failed');
        const b2Col = db.prepare('SELECT id FROM columns WHERE board_id = ? LIMIT 1').get(b2Res.body.board.id);

        // Attempt move task from board 1 to board 2 column
        const moveRes = await request('PATCH', '/api/tasks/1/move', { column_id: b2Col.id, position: 0 }, alexToken);
        assert(moveRes.status === 400, `Expected 400 cross-board reject, got ${moveRes.status}`);
      });

      // ==========================================
      // SECTION 4: DATA VALIDATION & ERROR HANDLING
      // ==========================================
      console.log(`\n--- 4. Data Validation and Error Handling ---`);

      await test('Reject task with invalid priority (400)', async () => {
        const res = await request('POST', '/api/columns/1/tasks', {
          title: 'Bad Priority Task',
          priority: 'urgent_invalid'
        }, alexToken);
        assert(res.status === 400, `Expected 400, got ${res.status}`);
      });

      await test('Reject task with invalid due date format (400)', async () => {
        const res = await request('POST', '/api/columns/1/tasks', {
          title: 'Bad Date Task',
          due_date: 'not-a-valid-date'
        }, alexToken);
        assert(res.status === 400, `Expected 400, got ${res.status}`);
      });

      await test('Reject task creation with empty title (400)', async () => {
        const res = await request('POST', '/api/columns/1/tasks', {
          title: '   '
        }, alexToken);
        assert(res.status === 400, `Expected 400, got ${res.status}`);
      });

      await test('Reject comment creation with empty content (400)', async () => {
        const res = await request('POST', '/api/tasks/4/comments', {
          content: '   '
        }, alexToken);
        assert(res.status === 400, `Expected 400, got ${res.status}`);
      });

      await test('Reject task move with negative position (400)', async () => {
        const res = await request('PATCH', '/api/tasks/4/move', {
          column_id: 2,
          position: -5
        }, alexToken);
        assert(res.status === 400, `Expected 400, got ${res.status}`);
      });

      await test('Reject column move with negative position (400)', async () => {
        const res = await request('PATCH', '/api/columns/1/move', {
          position: -1
        }, alexToken);
        assert(res.status === 400, `Expected 400, got ${res.status}`);
      });

      console.log(`\n======================================================`);
      console.log(` Test Execution Completed: ${passedCount} Passed, ${failedCount} Failed`);
      console.log(`======================================================\n`);

      server.close();

      // Clean up disposable test database
      [TEST_DB_PATH, `${TEST_DB_PATH}-wal`, `${TEST_DB_PATH}-shm`].forEach(f => {
        if (fs.existsSync(f)) try { fs.unlinkSync(f); } catch (e) {}
      });

      if (failedCount > 0) {
        process.exit(1);
      } else {
        process.exit(0);
      }
    } catch (err) {
      console.error('Test runner fatal error:', err);
      if (server) server.close();
      process.exit(1);
    }
  });
}

runTestSuite();
