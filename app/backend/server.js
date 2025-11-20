import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { initDatabase } from './src/config/db.js';
import apiRoutes from './src/routes/api.js';

const app = express();

// 1. Init DB
initDatabase();

// 2. Config
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()) 
  : true;

// 3. Middleware
app.use(cors({ 
    origin: allowedOrigins, 
    credentials: true 
}));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('tiny'));

// 4. Routes (No Session Middleware needed)
app.use('/api', apiRoutes);

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`RØB Backend listening on port ${port}`));