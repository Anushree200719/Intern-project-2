const fs = require('fs');
const path = require('path');
const db = require('./db');

function backupDatabase() {
  const dbPath = db.dbPath || process.env.DB_PATH || path.join(__dirname, '..', 'data', 'taskboard.db');
  if (!fs.existsSync(dbPath)) return null;

  try {
    const backupDir = path.join(path.dirname(dbPath), 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    // Force SQLite WAL checkpoint before copying so database file is fully synchronized
    try {
      db.pragma('wal_checkpoint(TRUNCATE)');
    } catch (e) {
      // Ignore pragma error if db is closed or locked
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const baseName = path.basename(dbPath, path.extname(dbPath));
    const backupFile = path.join(backupDir, `${baseName}-backup-${timestamp}.db`);

    fs.copyFileSync(dbPath, backupFile);
    console.log(`📦 Automatic data backup created at: ${backupFile}`);
    return backupFile;
  } catch (err) {
    console.error('⚠️  Failed to create database backup:', err.message);
    return null;
  }
}

function seedDatabase(options = {}) {
  const isReset = options.reset || process.argv.includes('--reset') || process.argv.includes('--force');

  // Guard against destructive operations in production
  if (isReset && process.env.NODE_ENV === 'production') {
    const errorMsg = 'SECURITY VIOLATION: Destructive database reset (--reset) is strictly forbidden in production!';
    console.error(`❌ ${errorMsg}`);
    if (options.throwOnError) {
      throw new Error(errorMsg);
    }
    process.exit(1);
  }

  // Check if database already has user data
  let userCount = 0;
  try {
    const userCountRow = db.prepare('SELECT COUNT(*) AS count FROM users').get();
    userCount = userCountRow ? userCountRow.count : 0;
  } catch (err) {
    // If tables don't exist yet, db.js schema initialization creates them
  }

  if (isReset) {
    console.log('🔄 Explicit development reset requested...');
    // Create backup before any destructive operation
    if (userCount > 0) {
      backupDatabase();
    }

    console.log('   Clearing development database tables...');
    const clearTx = db.transaction(() => {
      db.prepare('DELETE FROM activity_log').run();
      db.prepare('DELETE FROM comments').run();
      db.prepare('DELETE FROM tasks').run();
      db.prepare('DELETE FROM columns').run();
      db.prepare('DELETE FROM board_members').run();
      db.prepare('DELETE FROM boards').run();
      db.prepare('DELETE FROM users').run();
    });
    clearTx();
    console.log('   Existing data cleared.');
  } else if (userCount > 0) {
    console.log(`ℹ️  Database already contains ${userCount} user account(s).`);
    console.log('   Safe mode: Preserving existing application data (non-destructive seed).');
    console.log('   To explicitly reset development data, run: npm run seed:reset');
  }

  console.log(isReset ? '🌱 Seeding fresh TaskBoard development records...' : '🌱 Ensuring sample demo data is present...');
  const seedSqlPath = path.join(__dirname, '..', 'seed.sql');
  if (!fs.existsSync(seedSqlPath)) {
    console.error('seed.sql file not found at:', seedSqlPath);
    if (options.throwOnError) throw new Error('seed.sql not found');
    process.exit(1);
  }

  const seedSql = fs.readFileSync(seedSqlPath, 'utf8');

  try {
    db.exec(seedSql);
    console.log('✅ Database seeded successfully (idempotent)!');
    console.log('----------------------------------------------------');
    console.log('Development Sample Accounts:');
    console.log('1. alex@taskboard.local   / password123 (Board Owner)');
    console.log('2. sam@taskboard.local    / password123 (Engineer)');
    console.log('3. jordan@taskboard.local / password123 (UI/UX)');
    console.log('----------------------------------------------------');
  } catch (error) {
    console.error('Error seeding database:', error);
    if (options.throwOnError) throw error;
    process.exit(1);
  }
}

if (require.main === module) {
  seedDatabase();
}

seedDatabase.backupDatabase = backupDatabase;

module.exports = seedDatabase;
