const fs = require('fs');
const path = require('path');
const db = require('./db');

function seedDatabase(options = {}) {
  const isReset = options.reset || process.argv.includes('--reset') || process.argv.includes('--force');

  // Check if database already has user data
  try {
    const userCountRow = db.prepare('SELECT COUNT(*) AS count FROM users').get();
    const userCount = userCountRow ? userCountRow.count : 0;

    if (userCount > 0 && !isReset) {
      console.log(`ℹ️  Database already contains ${userCount} user account(s).`);
      console.log('   Safe mode: Preserving existing application data.');
      console.log('   To explicitly reset development data, run: npm run seed:reset (or node server/seed.js --reset)');
      return;
    }
  } catch (err) {
    // If tables don't exist yet, db.js schema initialization creates them
  }

  console.log(isReset ? '🔄 Resetting and seeding TaskBoard development database...' : '🌱 Seeding empty TaskBoard database...');
  const seedSqlPath = path.join(__dirname, '..', 'seed.sql');
  if (!fs.existsSync(seedSqlPath)) {
    console.error('seed.sql file not found at:', seedSqlPath);
    process.exit(1);
  }

  const seedSql = fs.readFileSync(seedSqlPath, 'utf8');

  try {
    db.exec(seedSql);
    console.log('✅ Database seeded successfully!');
    console.log('----------------------------------------------------');
    console.log('Development Sample Accounts:');
    console.log('1. alex@taskboard.local   / password123 (Board Owner)');
    console.log('2. sam@taskboard.local    / password123 (Engineer)');
    console.log('3. jordan@taskboard.local / password123 (UI/UX)');
    console.log('----------------------------------------------------');
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  seedDatabase();
}

module.exports = seedDatabase;
