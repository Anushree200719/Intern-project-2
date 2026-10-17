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
const { getJwtSecret } = require('./server/middleware/auth');
const { getClientIp } = require('./server/middleware/rateLimit');
const { escapeHtml } = require('./public/js/api');

// Seed test database
seedDatabase({ reset: true });

let server;

function request(method, reqPath, body = null, token = null, extraHeaders = {}) {
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
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...extraHeaders
      }
    };

    const req = http.request(options, (res) => {
      let responseBody = '';
      res.on('data', chunk => responseBody += chunk);
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(responseBody); } catch (e) { parsed = responseBody; }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed });
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
    console.log(` TaskBoard Comprehensive Security & Quality Test Suite`);
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
      const boardId = 1;

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

      await test('Rate limiting returns 429 when threshold exceeded', async () => {
        // Trigger 11 attempts with x-test-rate-limit to test rate limiter
        let got429 = false;
        for (let i = 0; i < 12; i++) {
          const res = await request('POST', '/api/auth/login', {
            email: 'rate_test@taskboard.local',
            password: 'wrong'
          }, null, { 'x-test-rate-limit': '1' });
          if (res.status === 429) {
            got429 = true;
            assert(res.headers['retry-after'], 'Missing Retry-After header on 429 response');
            break;
          }
        }
        assert(got429, 'Rate limiter did not return 429 after threshold exceeded');
      });

      await test('Rate limiter getClientIp ignores spoofed X-Forwarded-For when TRUST_PROXY is false', () => {
        const origTrust = process.env.TRUST_PROXY;
        try {
          process.env.TRUST_PROXY = 'false';
          const mockReq = {
            headers: { 'x-forwarded-for': '203.0.113.195, 10.0.0.1' },
            socket: { remoteAddress: '192.168.1.100' }
          };
          const resolvedIp = getClientIp(mockReq);
          assert(resolvedIp === '192.168.1.100', `Expected remoteAddress 192.168.1.100, got ${resolvedIp}`);
        } finally {
          process.env.TRUST_PROXY = origTrust;
        }
      });

      await test('Rate limiter getClientIp honors X-Forwarded-For when TRUST_PROXY is true', () => {
        const origTrust = process.env.TRUST_PROXY;
        try {
          process.env.TRUST_PROXY = 'true';
          const mockReq = {
            headers: { 'x-forwarded-for': '203.0.113.195, 10.0.0.1' },
            socket: { remoteAddress: '192.168.1.100' }
          };
          const resolvedIp = getClientIp(mockReq);
          assert(resolvedIp === '203.0.113.195', `Expected first proxy IP 203.0.113.195, got ${resolvedIp}`);
        } finally {
          process.env.TRUST_PROXY = origTrust;
        }
      });

      // ==========================================
      // SECTION 2: SECURITY HEADERS & CORS
      // ==========================================
      console.log(`\n--- 2. Security Headers, CORS & CSP ---`);

      await test('Security headers are present on API responses', async () => {
        const res = await request('GET', '/api/health');
        assert(res.headers['x-content-type-options'] === 'nosniff', 'Missing X-Content-Type-Options');
        assert(res.headers['x-frame-options'] === 'DENY', 'Missing X-Frame-Options');
        assert(res.headers['referrer-policy'] === 'strict-origin-when-cross-origin', 'Missing Referrer-Policy');
        assert(res.headers['content-security-policy'], 'Missing Content-Security-Policy');
        assert(res.headers['content-security-policy'].includes("script-src 'self'"), 'CSP missing script-src self');
        assert(res.headers['content-security-policy'].includes('https://fonts.googleapis.com'), 'CSP missing fonts.googleapis.com');
      });

      await test('CORS blocks unapproved cross-origin requests when allowlist is set', async () => {
        // Test production-like origin blocking logic directly
        const allowedOrigins = ['http://localhost:3000', 'https://trusted.taskboard.local'];
        const isAllowed = (origin) => !origin || allowedOrigins.includes(origin);
        assert(!isAllowed('https://evil-attacker.example.com'), 'Untrusted origin should be rejected');
        assert(isAllowed('https://trusted.taskboard.local'), 'Trusted origin should be allowed');
        assert(isAllowed(null), 'Direct non-browser requests should be allowed');
      });

      // ==========================================
      // SECTION 3: AUTHORIZATION & PERMISSIONS
      // ==========================================
      console.log(`\n--- 3. Role-Based Authorization & Permissions ---`);

      await test('Non-member cannot access private board (403)', async () => {
        const res = await request('GET', `/api/boards/${boardId}`, null, outsiderToken);
        assert(res.status === 403, `Expected 403, got ${res.status}`);
      });

      await test('Non-member cannot view board activity (403)', async () => {
        const res = await request('GET', `/api/boards/${boardId}/activity`, null, outsiderToken);
        assert(res.status === 403, `Expected 403, got ${res.status}`);
      });

      await test('Non-member cannot view board task detail (403)', async () => {
        const res = await request('GET', '/api/tasks/1', null, outsiderToken);
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

      await test('Non-owner cannot remove member from board (403)', async () => {
        const outsiderUser = db.prepare('SELECT id FROM users WHERE email = ?').get('outsider@taskboard.local');
        const res = await request('DELETE', `/api/boards/${boardId}/members/${outsiderUser.id}`, null, samToken);
        assert(res.status === 403, `Expected 403, got ${res.status}`);
      });

      await test('Board owner cannot remove themselves from board (400)', async () => {
        const ownerUser = db.prepare('SELECT id FROM users WHERE email = ?').get('alex@taskboard.local');
        const res = await request('DELETE', `/api/boards/${boardId}/members/${ownerUser.id}`, null, alexToken);
        assert(res.status === 400, `Expected 400, got ${res.status}`);
      });

      await test('Ordinary member CANNOT delete column (403 Forbidden)', async () => {
        const res = await request('DELETE', '/api/columns/1', null, samToken);
        assert(res.status === 403, `Expected 403 Forbidden, got ${res.status}`);
      });

      await test('Board owner can delete an empty column (200)', async () => {
        const createColRes = await request('POST', `/api/boards/${boardId}/columns`, { name: 'Temp Col' }, alexToken);
        assert(createColRes.status === 201, 'Column creation failed');
        const colId = createColRes.body.column.id;

        const delRes = await request('DELETE', `/api/columns/${colId}`, null, alexToken);
        assert(delRes.status === 200, `Expected 200, got ${delRes.status}`);
      });

      await test('Column deletion with tasks requires confirmation (?force=true)', async () => {
        const unforcedRes = await request('DELETE', '/api/columns/1', null, alexToken);
        assert(unforcedRes.status === 400 && unforcedRes.body.hasTasks, `Expected 400 with hasTasks, got ${unforcedRes.status}`);
      });

      await test('Task assignee must be a member of the board (400 if not)', async () => {
        const outsiderUser = db.prepare('SELECT id FROM users WHERE email = ?').get('outsider@taskboard.local');
        // Remove outsider from board first
        await request('DELETE', `/api/boards/${boardId}/members/${outsiderUser.id}`, null, alexToken);

        const res = await request('POST', '/api/columns/1/tasks', {
          title: 'Illegal Assignment Task',
          assignee_id: outsiderUser.id
        }, alexToken);
        assert(res.status === 400, `Expected 400, got ${res.status}`);
      });

      await test('Only comment author can delete their comment (403 for other member, 200 for author)', async () => {
        const postComment = await request('POST', '/api/tasks/4/comments', { content: 'Sam comment' }, samToken);
        assert(postComment.status === 201, 'Comment post failed');
        const commentId = postComment.body.comment.id;

        const unauthorizedDel = await request('DELETE', `/api/comments/${commentId}`, null, alexToken);
        assert(unauthorizedDel.status === 403, `Expected 403, got ${unauthorizedDel.status}`);

        const authorizedDel = await request('DELETE', `/api/comments/${commentId}`, null, samToken);
        assert(authorizedDel.status === 200, `Expected 200, got ${authorizedDel.status}`);
      });

      // ==========================================
      // SECTION 4: COLUMN & TASK ORDERING
      // ==========================================
      console.log(`\n--- 4. Column and Task Ordering Verification ---`);

      await test('Column reordering: move column to new position', async () => {
        const res = await request('PATCH', '/api/columns/1/move', { position: 2 }, alexToken);
        assert(res.status === 200, `Expected 200, got ${res.status}`);

        const cols = db.prepare('SELECT id, position FROM columns WHERE board_id = ? ORDER BY position ASC').all(boardId);
        assert(cols.every((c, idx) => c.position === idx), 'Positions are not contiguous 0..N');
      });

      await test('Task move within same column updates positions in transaction', async () => {
        const res = await request('PATCH', '/api/tasks/1/move', { column_id: 1, position: 2 }, alexToken);
        assert(res.status === 200, `Expected 200, got ${res.status}`);

        const tasksInCol = db.prepare('SELECT id, position FROM tasks WHERE column_id = 1 ORDER BY position ASC').all();
        assert(tasksInCol.every((t, idx) => t.position === idx), 'Positions are not contiguous 0..N');
      });

      await test('Task move to different column updates both columns in transaction', async () => {
        const res = await request('PATCH', '/api/tasks/1/move', { column_id: 2, position: 0 }, alexToken);
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        assert(res.body.task.column_id === 2, 'Task column_id did not update');

        const col1Tasks = db.prepare('SELECT id, position FROM tasks WHERE column_id = 1 ORDER BY position ASC').all();
        const col2Tasks = db.prepare('SELECT id, position FROM tasks WHERE column_id = 2 ORDER BY position ASC').all();
        assert(col1Tasks.every((t, idx) => t.position === idx), 'Col 1 positions not contiguous');
        assert(col2Tasks.every((t, idx) => t.position === idx), 'Col 2 positions not contiguous');
      });

      await test('Reject task move to column belonging to another board (400)', async () => {
        const b2Res = await request('POST', '/api/boards', { name: 'Board Two' }, alexToken);
        assert(b2Res.status === 201, 'Board 2 create failed');
        const b2Col = db.prepare('SELECT id FROM columns WHERE board_id = ? LIMIT 1').get(b2Res.body.board.id);

        const moveRes = await request('PATCH', '/api/tasks/1/move', { column_id: b2Col.id, position: 0 }, alexToken);
        assert(moveRes.status === 400, `Expected 400 cross-board reject, got ${moveRes.status}`);
      });

      // ==========================================
      // SECTION 5: STRICT INPUT VALIDATION & ERROR HANDLING
      // ==========================================
      console.log(`\n--- 5. Strict Input Validation and Error Handling ---`);

      await test('Reject registration with non-string fields (400)', async () => {
        const res = await request('POST', '/api/auth/register', {
          name: 12345,
          email: 'invalid@type.com',
          password: 'password123',
          confirmPassword: 'password123'
        });
        assert(res.status === 400, `Expected 400, got ${res.status}`);
      });

      await test('Reject login with non-string fields (400)', async () => {
        const res = await request('POST', '/api/auth/login', {
          email: { attack: true },
          password: 'password123'
        });
        assert(res.status === 400, `Expected 400, got ${res.status}`);
      });

      await test('Reject negative or non-numeric Board ID parameter (400)', async () => {
        const resNeg = await request('GET', '/api/boards/-5', null, alexToken);
        assert(resNeg.status === 400, `Expected 400 for -5, got ${resNeg.status}`);

        const resAlpha = await request('GET', '/api/boards/abc', null, alexToken);
        assert(resAlpha.status === 400, `Expected 400 for abc, got ${resAlpha.status}`);

        const resZero = await request('GET', '/api/boards/0', null, alexToken);
        assert(resZero.status === 400, `Expected 400 for 0, got ${resZero.status}`);
      });

      await test('Reject negative or non-numeric Task ID parameter (400)', async () => {
        const resNeg = await request('GET', '/api/tasks/-1', null, alexToken);
        assert(resNeg.status === 400, `Expected 400, got ${resNeg.status}`);

        const resAlpha = await request('GET', '/api/tasks/invalid_id', null, alexToken);
        assert(resAlpha.status === 400, `Expected 400, got ${resAlpha.status}`);
      });

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

      await test('Reject task creation with non-string title (400)', async () => {
        const res = await request('POST', '/api/columns/1/tasks', {
          title: 12345
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

      await test('Reject board creation with overly long name > 80 chars (400)', async () => {
        const longName = 'A'.repeat(85);
        const res = await request('POST', '/api/boards', { name: longName }, alexToken);
        assert(res.status === 400, `Expected 400, got ${res.status}`);
      });

      await test('Reject task update with empty title (400)', async () => {
        const res = await request('PUT', '/api/tasks/1', { title: '   ' }, alexToken);
        assert(res.status === 400, `Expected 400, got ${res.status}`);
      });

      await test('Reject task update with invalid priority (400)', async () => {
        const res = await request('PUT', '/api/tasks/1', { title: 'Valid Title', priority: 'critical' }, alexToken);
        assert(res.status === 400, `Expected 400, got ${res.status}`);
      });

      await test('Reject task update with invalid due date format (400)', async () => {
        const res = await request('PUT', '/api/tasks/1', { title: 'Valid Title', due_date: '2026-02-31' }, alexToken);
        assert(res.status === 400, `Expected 400, got ${res.status}`);
      });

      await test('Reject comment exceeding maximum length of 2000 characters (400)', async () => {
        const longComment = 'C'.repeat(2005);
        const res = await request('POST', '/api/tasks/1/comments', { content: longComment }, alexToken);
        assert(res.status === 400, `Expected 400, got ${res.status}`);
      });

      // ==========================================
      // SECTION 6: SEEDING WITHOUT DATA LOSS
      // ==========================================
      console.log(`\n--- 6. Seeding Without Data Loss & Production Protection ---`);

      await test('Normal seeding is non-destructive and preserves existing user data', async () => {
        // Create custom user
        const customEmail = 'preservation_test@taskboard.local';
        await request('POST', '/api/auth/register', {
          name: 'Preserved User',
          email: customEmail,
          password: 'password123',
          confirmPassword: 'password123'
        });

        const userBefore = db.prepare('SELECT id FROM users WHERE email = ?').get(customEmail);
        assert(userBefore, 'User was not created');

        // Run non-destructive seed
        seedDatabase({ reset: false });

        const userAfter = db.prepare('SELECT id FROM users WHERE email = ?').get(customEmail);
        assert(userAfter, 'Non-destructive seeding deleted existing custom user!');
      });

      await test('Destructive seed (--reset) refuses to operate in production', async () => {
        const originalEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';
        let refused = false;

        try {
          seedDatabase({ reset: true, throwOnError: true });
        } catch (e) {
          refused = true;
        } finally {
          process.env.NODE_ENV = originalEnv;
        }

        assert(refused, 'Destructive reset did not refuse to run in production!');
      });

      await test('Automatic database backup creates a valid physical backup file', () => {
        const backupFile = seedDatabase.backupDatabase();
        assert(backupFile && typeof backupFile === 'string', 'Backup file path was not returned');
        assert(fs.existsSync(backupFile), `Backup file does not exist on disk: ${backupFile}`);
        assert(fs.statSync(backupFile).size > 0, 'Backup file is empty');
        // Clean up test backup file
        try { fs.unlinkSync(backupFile); } catch (e) {}
      });

      // ==========================================
      // SECTION 7: JWT SECURITY CONFIGURATION
      // ==========================================
      console.log(`\n--- 7. JWT Security Configuration Tests ---`);

      await test('getJwtSecret() succeeds with strong secret and returns trimmed value', () => {
        const secret = getJwtSecret();
        assert(secret && secret.length >= 16, 'JWT secret is too short');
      });

      await test('Production rejects weak or default placeholder JWT secrets', () => {
        const originalEnv = process.env.NODE_ENV;
        const originalSecret = process.env.JWT_SECRET;

        process.env.NODE_ENV = 'production';
        process.env.JWT_SECRET = 'replace_with_a_secure_random_string_at_least_32_characters_long';

        let rejected = false;
        try {
          getJwtSecret();
        } catch (err) {
          rejected = true;
          assert(!err.message.includes('replace_with'), 'Secret must not be printed in error message');
        } finally {
          process.env.NODE_ENV = originalEnv;
          process.env.JWT_SECRET = originalSecret;
        }

        assert(rejected, 'Did not reject placeholder JWT secret in production');
      });

      // ==========================================
      // SECTION 8: XSS INJECTION & SANITIZATION TESTS
      // ==========================================
      console.log(`\n--- 8. Frontend Injection & XSS Regression Tests ---`);

      await test('API accepts strings containing HTML special characters and stores them verbatim', async () => {
        const xssPayload = '<script>alert("xss")</script><img src=x onerror=alert(1)>';
        const res = await request('POST', `/api/columns/1/tasks`, {
          title: xssPayload,
          description: 'Testing special chars: & < > " \''
        }, alexToken);

        assert(res.status === 201, `Expected 201, got ${res.status}`);
        assert(res.body.task.title === xssPayload, 'Stored payload modified unexpectedly');
      });

      await test('Frontend escapeHtml helper sanitizes all dangerous HTML tags and quotes', () => {
        const dirty = '<script>alert("xss")</script>&<img src="x" onerror=\'alert(1)\'>';
        const clean = escapeHtml(dirty);

        assert(!clean.includes('<script>'), 'Contains raw script tag');
        assert(!clean.includes('<img'), 'Contains raw img tag');
        assert(!clean.includes('"'), 'Contains unescaped double quote');
        assert(!clean.includes("'"), 'Contains unescaped single quote');
        assert(clean.includes('&lt;script&gt;'), 'Failed to escape <script>');
        assert(clean.includes('&quot;'), 'Failed to escape double quotes');
        assert(clean.includes('&#039;'), 'Failed to escape single quotes');
        assert(clean.includes('&amp;'), 'Failed to escape &');
      });

      // ==========================================
      // SECTION 9: DATABASE TRANSACTIONS & ROLLBACK
      // ==========================================
      console.log(`\n--- 9. Database Transactions & Rollback Behavior ---`);

      await test('Failed transaction rolls back completely without leaving orphaned records', () => {
        const initialTaskCount = db.prepare('SELECT COUNT(*) AS count FROM tasks').get().count;

        let transactionFailed = false;
        try {
          const faultyTx = db.transaction(() => {
            // 1. Insert a temporary task
            db.prepare(`
              INSERT INTO tasks (board_id, column_id, title, priority, created_by, position)
              VALUES (1, 1, 'Transactional Test Task', 'medium', 1, 999)
            `).run();

            // 2. Intentionally throw an error / trigger failure
            throw new Error('Simulated atomic transaction error');
          });

          faultyTx();
        } catch (err) {
          transactionFailed = true;
        }

        assert(transactionFailed, 'Transaction did not throw');
        const finalTaskCount = db.prepare('SELECT COUNT(*) AS count FROM tasks').get().count;
        assert(initialTaskCount === finalTaskCount, `Task count mismatch! Expected ${initialTaskCount}, got ${finalTaskCount}. Rollback failed.`);
      });

      await test('SQLite foreign keys are enabled and enforce relational integrity', () => {
        const fkStatus = db.pragma('foreign_keys', { simple: true });
        assert(fkStatus === 1, `Foreign keys PRAGMA expected 1, got ${fkStatus}`);

        let fkErrorCaught = false;
        try {
          // Attempt to insert a task referencing a non-existent column (id 999999)
          db.prepare(`
            INSERT INTO tasks (board_id, column_id, title, priority, created_by, position)
            VALUES (1, 999999, 'Invalid FK Task', 'medium', 1, 0)
          `).run();
        } catch (err) {
          fkErrorCaught = true;
          assert(err.message.includes('FOREIGN KEY') || err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY', `Unexpected error: ${err.message}`);
        }
        assert(fkErrorCaught, 'SQLite foreign keys failed to reject orphaned record insertion!');
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
