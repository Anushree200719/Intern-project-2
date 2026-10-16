const fs = require('fs');
const path = require('path');
const db = require('./db');

function seedDatabase() {
  console.log('Seeding TaskBoard database...');
  const seedSqlPath = path.join(__dirname, '..', 'seed.sql');
  if (!fs.existsSync(seedSqlPath)) {
    console.error('seed.sql file not found at:', seedSqlPath);
    process.exit(1);
  }

  const seedSql = fs.readFileSync(seedSqlPath, 'utf8');

  try {
    db.exec(seedSql);
    console.log('Database seeded successfully!');
    console.log('-------------------------------------------');
    console.log('Sample Developer Accounts:');
    console.log('1. alex@taskboard.local   / password123 (Board Owner & Lead)');
    console.log('2. sam@taskboard.local    / password123 (Full-stack Engineer)');
    console.log('3. jordan@taskboard.local / password123 (UI/UX & QA)');
    console.log('-------------------------------------------');
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  seedDatabase();
}

module.exports = seedDatabase;
