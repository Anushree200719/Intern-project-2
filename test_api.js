const http = require('http');
const app = require('./server/app');

let server;
const PORT = 3099;

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'localhost',
      port: PORT,
      path,
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

async function runTests() {
  server = app.listen(PORT, async () => {
    console.log(`Test runner listening on port ${PORT}`);
    try {
      // 1. Health check
      console.log('--- 1. Testing Health Check ---');
      const health = await request('GET', '/api/health');
      if (health.status !== 200) throw new Error('Health check failed: ' + JSON.stringify(health));
      console.log('✔ Health check OK');

      // 2. Login as seeded user Alex Morgan
      console.log('--- 2. Testing Login ---');
      const loginRes = await request('POST', '/api/auth/login', {
        email: 'alex@taskboard.local',
        password: 'password123'
      });
      if (loginRes.status !== 200 || !loginRes.body.token) throw new Error('Login failed: ' + JSON.stringify(loginRes));
      const alexToken = loginRes.body.token;
      console.log('✔ Alex login OK, token received');

      // 3. Register a brand new test user
      console.log('--- 3. Testing Registration ---');
      const regRes = await request('POST', '/api/auth/register', {
        name: 'Dev Tester',
        email: `devtester_${Date.now()}@taskboard.local`,
        password: 'password123',
        confirmPassword: 'password123'
      });
      if (regRes.status !== 201 || !regRes.body.token) throw new Error('Registration failed: ' + JSON.stringify(regRes));
      const newTesterToken = regRes.body.token;
      console.log('✔ Registration OK, token received');

      // 4. Fetch boards as Alex
      console.log('--- 4. Testing Board Retrieval ---');
      const boardsRes = await request('GET', '/api/boards', null, alexToken);
      if (boardsRes.status !== 200 || !boardsRes.body.boards.length) throw new Error('Get boards failed: ' + JSON.stringify(boardsRes));
      const sampleBoard = boardsRes.body.boards[0];
      console.log(`✔ Boards retrieved: ${boardsRes.body.boards.length} board(s). First: "${sampleBoard.name}"`);

      // 5. Test Board Details
      console.log('--- 5. Testing Board Details & Columns ---');
      const boardDetailRes = await request('GET', `/api/boards/${sampleBoard.id}`, null, alexToken);
      if (boardDetailRes.status !== 200 || !boardDetailRes.body.board.columns.length) throw new Error('Get board detail failed');
      const cols = boardDetailRes.body.board.columns;
      console.log(`✔ Board detail OK, columns count: ${cols.length} (names: ${cols.map(c => c.name).join(', ')})`);

      // 6. Test Task Creation
      console.log('--- 6. Testing Task Creation in Column 1 ---');
      const taskRes = await request('POST', `/api/columns/${cols[0].id}/tasks`, {
        title: 'Automated Test Task 1',
        description: 'Verifying end-to-end task creation via REST API',
        priority: 'high',
        due_date: '2026-12-31'
      }, alexToken);
      if (taskRes.status !== 201 || !taskRes.body.task.id) throw new Error('Task create failed: ' + JSON.stringify(taskRes));
      const createdTask = taskRes.body.task;
      console.log(`✔ Task created with ID ${createdTask.id}: "${createdTask.title}" at position ${createdTask.position}`);

      // 7. Test Comment Creation & Ownership
      console.log('--- 7. Testing Comment Creation ---');
      const commentRes = await request('POST', `/api/tasks/${createdTask.id}/comments`, {
        content: 'This is an automated test comment.'
      }, alexToken);
      if (commentRes.status !== 201 || !commentRes.body.comment.id) throw new Error('Comment create failed: ' + JSON.stringify(commentRes));
      const commentId = commentRes.body.comment.id;
      console.log(`✔ Comment created with ID ${commentId}`);

      // 8. Test Non-Member Authorization Denial
      console.log('--- 8. Testing Authorization Enforcement (Non-member blocked) ---');
      const unauthorizedAccess = await request('GET', `/api/boards/${sampleBoard.id}`, null, newTesterToken);
      if (unauthorizedAccess.status !== 403) throw new Error('Expected 403 Forbidden for non-member, got ' + unauthorizedAccess.status);
      console.log('✔ Non-member correctly blocked with 403 Forbidden');

      // 9. Test Task Movement & Reordering (Move to Column 2 at position 0)
      console.log('--- 9. Testing Task Movement & Transactional Reordering ---');
      const moveRes = await request('PATCH', `/api/tasks/${createdTask.id}/move`, {
        column_id: cols[1].id,
        position: 0
      }, alexToken);
      if (moveRes.status !== 200 || moveRes.body.task.column_id !== cols[1].id) throw new Error('Move task failed: ' + JSON.stringify(moveRes));
      console.log(`✔ Task successfully moved to column "${cols[1].name}" at position 0`);

      // 10. Test Search & Filter
      console.log('--- 10. Testing Search & Filters ---');
      const searchRes = await request('GET', `/api/boards/${sampleBoard.id}/tasks?q=Automated&priority=high`, null, alexToken);
      if (searchRes.status !== 200 || !searchRes.body.tasks.some(t => t.id === createdTask.id)) {
        throw new Error('Search failed: ' + JSON.stringify(searchRes));
      }
      console.log(`✔ Search and filters working accurately (found matching task)`);

      // 11. Test Comment Delete
      console.log('--- 11. Testing Comment Deletion (Author Allowed) ---');
      const delCommentRes = await request('DELETE', `/api/comments/${commentId}`, null, alexToken);
      if (delCommentRes.status !== 200) throw new Error('Comment delete failed');
      console.log('✔ Comment successfully deleted by author');

      // 12. Test Task Delete
      console.log('--- 12. Testing Task Deletion ---');
      const delTaskRes = await request('DELETE', `/api/tasks/${createdTask.id}`, null, alexToken);
      if (delTaskRes.status !== 200) throw new Error('Task delete failed');
      console.log('✔ Task successfully deleted');

      console.log('\n=======================================');
      console.log('ALL 12 BACKEND INTEGRATION TESTS PASSED!');
      console.log('=======================================\n');

      server.close();
      process.exit(0);
    } catch (err) {
      console.error('TEST FAILED:', err);
      if (server) server.close();
      process.exit(1);
    }
  });
}

runTests();
