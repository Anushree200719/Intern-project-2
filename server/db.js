const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
require('dotenv').config();

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'taskboard.db');
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

// Enable SQLite Foreign Key constraints and WAL mode
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

// Initialize schema if not present
const schemaPath = path.join(__dirname, 'schema.sql');
if (fs.existsSync(schemaPath)) {
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schemaSql);
}

db.dbPath = dbPath;

module.exports = db;
