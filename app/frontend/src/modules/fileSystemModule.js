/**
 * File System Access helpers
 */

const isSupported = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window;

const selectDirectory = async () => {
  if (!isSupported()) throw new Error('File System Access API not supported');
  return window.showDirectoryPicker();
};

const selectFile = async (options) => {
  if (!('showOpenFilePicker' in window)) throw new Error('File picker not supported');
  const handles = await window.showOpenFilePicker(options);
  return handles[0];
};

const readAllFiles = async (directoryHandle, fileList = []) => {
  for await (const entry of directoryHandle.values()) {
    if (entry.kind === 'file') {
      fileList.push(entry);
    } else if (entry.kind === 'directory') {
      await readAllFiles(entry, fileList);
    }
  }
  return fileList;
};

const readFileAsUint8Array = async (fileHandle) => {
  const file = await fileHandle.getFile();
  const arrayBuffer = await file.arrayBuffer();
  return new Uint8Array(arrayBuffer);
};

const readFileAsText = async (fileHandle) => {
  const file = await fileHandle.getFile();
  return file.text();
};

const writeBytesToHandle = async (fileHandle, bytes) => {
  const writable = await fileHandle.createWritable();
  await writable.write(bytes);
  await writable.close();
};

export const FileSystemModule = {
  isSupported,
  selectDirectory,
  selectFile,
  readAllFiles,
  readFileAsUint8Array,
  readFileAsText,
  writeBytesToHandle
};
