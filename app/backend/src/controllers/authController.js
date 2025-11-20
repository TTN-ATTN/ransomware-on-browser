import { pbkdf2Sync, randomBytes } from 'crypto';
import { createVictimIdentity } from './attackController.js'; // We reuse this to gen keys on register
import db from '../config/db.js';

// --- Helpers ---
const hashPassword = (password, salt = randomBytes(16).toString('hex')) => {
    const hash = pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return { hash, salt };
};

const verifyPassword = (password, hash, salt) => {
    const verifyHash = pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return hash === verifyHash;
};

// --- Controllers ---

export const checkSession = (req, res) => {
    if (req.session.user) {
        return res.json({ authenticated: true, user: req.session.user });
    }
    res.status(401).json({ authenticated: false });
};

export const register = (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Missing fields' });

    // Check if user exists
    db.get('SELECT username FROM users WHERE username = ?', [username], (err, row) => {
        if (row) return res.status(409).json({ error: 'Username taken' });

        // 1. Generate RØB Keys (Victim Identity)
        const identity = createVictimIdentity(req.ip);

        // 2. Hash Password
        const { hash, salt } = hashPassword(password);

        // 3. Save User
        db.run('INSERT INTO users (username, password_hash, salt, client_id) VALUES (?, ?, ?, ?)', 
            [username, hash, salt, identity.clientId], 
            (err) => {
                if (err) return res.status(500).json({ error: "DB Error" });

                // Auto-login after register
                req.session.user = {
                    username,
                    clientId: identity.clientId,
                    publicKey: identity.publicKey
                };

                res.status(201).json({
                    success: true,
                    username,
                    clientId: identity.clientId,
                    publicKey: identity.publicKey
                });
            }
        );
    });
};

export const login = (req, res) => {
    const { username, password } = req.body;

    db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
        if (!user || !verifyPassword(password, user.password_hash, user.salt)) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Retrieve RØB Keys associated with this user
        db.get('SELECT public_key FROM victims WHERE client_id = ?', [user.client_id], (err, victim) => {
            if (!victim) return res.status(500).json({ error: 'Identity data corruption' });

            // Set Session
            req.session.user = {
                username: user.username,
                clientId: user.client_id,
                publicKey: victim.public_key
            };

            res.json({
                success: true,
                username: user.username,
                clientId: user.client_id,
                publicKey: victim.public_key
            });
        });
    });
};

export const logout = (req, res) => {
    req.session.destroy();
    res.clearCookie('connect.sid');
    res.json({ success: true });
};