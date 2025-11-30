import Enigma from '@cubbit/enigma';

const bytesToBase64 = (bytes) => {
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
};

const base64ToBytes = (value) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const createAesInstance = async (rawKeyBytes) => {
  const aes = new Enigma.AES();
  await aes.init({
    key_bits: 256,
    key: rawKeyBytes,
    algorithm: Enigma.AES.Algorithm.GCM
  });
  return aes;
};

const generateSessionKey = async () => {
  const rawKey = crypto.getRandomValues(new Uint8Array(32));
  const aes = await createAesInstance(rawKey);
  return {
    aes,
    rawKeyBase64: bytesToBase64(rawKey)
  };
};

const encryptFile = async (fileContent, aesInstance) => {
  const result = await aesInstance.encrypt(fileContent);
  return {
    iv: new Uint8Array(result.iv),
    ciphertext: new Uint8Array(result.content),
    tag: result.tag ? new Uint8Array(result.tag) : null
  };
};

const decryptFile = async (encryptedData, rawKeyBase64) => {
  const aes = await createAesInstance(base64ToBytes(rawKeyBase64));
  const plain = await aes.decrypt({
    iv: encryptedData.iv,
    content: encryptedData.ciphertext,
    tag: encryptedData.tag || null
  });
  return new Uint8Array(plain);
};

export const CryptoModule = {
  generateSessionKey,
  encryptFile,
  decryptFile
};
