import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import session from 'express-session';
import SQLiteStoreFactory from 'connect-sqlite3';
import { initDatabase } from './src/config/db.js';
import apiRoutes from './src/routes/api.js';

const app = express();
const SQLiteStore = SQLiteStoreFactory(session);
const dataDir = path.resolve(process.cwd(), 'data');

// 1. Init DB
initDatabase();

// 2. Config
const parseAllowedOrigins = () => {
  const raw = process.env.ALLOWED_ORIGINS;
  if (!raw) return [];
  return raw.split(',').map(origin => origin.trim()).filter(Boolean);
};
const allowedOrigins = parseAllowedOrigins();

// 3. Middleware
app.use(cors({ 
    origin: allowedOrigins.length ? allowedOrigins : true, 
    credentials: true // Crucial for Session Cookies
}));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('tiny'));

// 4. Session
app.use(session({
    store: new SQLiteStore({ db: 'backend.sqlite', dir: dataDir }), 
    secret: 'super-secret-rob-key',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        maxAge: 24 * 60 * 60 * 1000, // 1 Day
        httpOnly: true,
        secure: false // Set true if you set up HTTPS later
    }
}));

// 5. Routes
app.use('/api', apiRoutes);

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Backend listening on port ${port}`));