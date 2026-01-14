import fs from 'fs/promises';
import path from 'path';
import AdmZip from 'adm-zip';
import { isValidPath } from './pathSanitizer.js';

export async function extractZip(zipBuffer, basePath = '') {
  const tempDir = process.env.TEMP_UPLOAD_DIR || './temp_uploads';
  const tempId = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const extractDir = path.join(tempDir, tempId);
  
  try {
    // Create temp directory
    await fs.mkdir(extractDir, { recursive: true });
    
    // Extract ZIP
    const zip = new AdmZip(zipBuffer);
    zip.extractAllTo(extractDir, true);
    
    // Scan extracted files
    const files = await scanDirectory(extractDir, '', basePath);
    
    // Read file contents
    const fileContents = await Promise.all(
      files.map(async (file) => {
        const content = await fs.readFile(file.fullPath);
        return {
          path: file.relativePath,
          name: path.basename(file.relativePath),
          size: content.length,
          content: content.toString('base64'),
          fullPath: file.fullPath
        };
      })
    );
    
    return {
      files: fileContents,
      tempId,
      extractDir,
      fileCount: fileContents.length,
      totalSize: fileContents.reduce((sum, file) => sum + file.size, 0)
    };
    
  } catch (error) {
    // Cleanup on error
    await cleanupTemp(tempId).catch(() => {});
    error.tempId = tempId;
    throw new Error(`Failed to extract ZIP file: ${error.message}`);
  }
}

async function scanDirectory(dir, relativeDir = '', basePath = '') {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.join(relativeDir, entry.name);
    const targetPath = path.join(basePath, relativePath).replace(/\\/g, '/');
    
    // Skip invalid paths
    if (!isValidPath(targetPath)) {
      console.warn(`Skipping invalid path: ${targetPath}`);
      continue;
    }
    
    if (entry.isDirectory()) {
      // Recursively scan subdirectories
      const subFiles = await scanDirectory(fullPath, relativePath, basePath);
      files.push(...subFiles);
    } else if (entry.isFile()) {
      files.push({
        fullPath,
        relativePath: targetPath,
        isDirectory: false
      });
    }
  }
  
  return files;
}

export async function cleanupTemp(tempId) {
  const tempDir = process.env.TEMP_UPLOAD_DIR || './temp_uploads';
  const dirToRemove = path.join(tempDir, tempId);
  
  try {
    await fs.rm(dirToRemove, { recursive: true, force: true });
    console.log(`Cleaned up temp directory: ${tempId}`);
  } catch (error) {
    console.warn(`Failed to cleanup temp directory ${tempId}:`, error.message);
  }
}

export function validateZipSize(zipBuffer, maxSize = 100 * 1024 * 1024) {
  if (zipBuffer.length > maxSize) {
    throw new Error(`ZIP file exceeds maximum size of ${maxSize / 1024 / 1024}MB`);
  }
  return true;
}
