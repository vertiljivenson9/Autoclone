import fs from 'fs/promises';
import path from 'path';
import { isValidPath } from './pathSanitizer.js';

export async function scanFileSystem(files, basePath = '') {
  const fileList = [];
  
  for (const file of files) {
    if (!file.webkitRelativePath && !file.path) {
      // Single file
      const targetPath = path.join(basePath, file.name).replace(/\\/g, '/');
      
      if (!isValidPath(targetPath)) {
        console.warn(`Skipping invalid path: ${targetPath}`);
        continue;
      }
      
      const content = await readFileAsBuffer(file);
      
      fileList.push({
        path: targetPath,
        name: file.name,
        size: file.size,
        content: content.toString('base64'),
        type: 'file'
      });
    } else {
      // File from directory (has webkitRelativePath)
      const relativePath = file.webkitRelativePath || file.path;
      const targetPath = path.join(basePath, relativePath).replace(/\\/g, '/');
      
      if (!isValidPath(targetPath)) {
        console.warn(`Skipping invalid path: ${targetPath}`);
        continue;
      }
      
      const content = await readFileAsBuffer(file);
      
      fileList.push({
        path: targetPath,
        name: path.basename(relativePath),
        size: file.size,
        content: content.toString('base64'),
        type: 'file'
      });
    }
  }
  
  return {
    files: fileList,
    fileCount: fileList.length,
    totalSize: fileList.reduce((sum, file) => sum + file.size, 0)
  };
}

async function readFileAsBuffer(file) {
  if (file.buffer) {
    return Buffer.from(file.buffer);
  }
  
  if (file.arrayBuffer) {
    const arrayBuffer = await file.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
  
  // For File objects in Node.js (from multer)
  if (file.buffer && Buffer.isBuffer(file.buffer)) {
    return file.buffer;
  }
  
  throw new Error('Unsupported file type or missing buffer');
}

export function validateFileList(files, maxFiles = 1000, maxTotalSize = 100 * 1024 * 1024) {
  if (files.length > maxFiles) {
    throw new Error(`Too many files. Maximum allowed: ${maxFiles}`);
  }
  
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  if (totalSize > maxTotalSize) {
    throw new Error(`Total size exceeds limit of ${maxTotalSize / 1024 / 1024}MB`);
  }
  
  return true;
}

export function groupFilesByExtension(files) {
  return files.reduce((groups, file) => {
    const ext = path.extname(file.name).toLowerCase() || 'no-extension';
    if (!groups[ext]) {
      groups[ext] = [];
    }
    groups[ext].push(file);
    return groups;
  }, {});
}
