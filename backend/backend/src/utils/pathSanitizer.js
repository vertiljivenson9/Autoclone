import path from 'path';

export function sanitizePath(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return '';
  }
  
  // Remove null bytes
  let sanitized = filePath.replace(/\0/g, '');
  
  // Normalize path separators
  sanitized = sanitized.replace(/\\/g, '/');
  
  // Remove leading/trailing slashes and spaces
  sanitized = sanitized.trim().replace(/^\/+|\/+$/g, '');
  
  // Split into parts
  const parts = sanitized.split('/');
  const validParts = [];
  
  for (const part of parts) {
    // Skip empty parts and current directory markers
    if (part === '' || part === '.') {
      continue;
    }
    
    // Prevent directory traversal
    if (part === '..') {
      if (validParts.length > 0) {
        validParts.pop();
      }
      continue;
    }
    
    // Clean part
    const cleanPart = part
      .replace(/[<>:"|?*]/g, '') // Remove invalid Windows characters
      .replace(/^\s+|\s+$/g, '') // Trim whitespace
      .replace(/\.{2,}/g, '.'); // Replace multiple dots with single
    
    if (cleanPart.length > 0) {
      validParts.push(cleanPart);
    }
  }
  
  return validParts.join('/');
}

export function isValidPath(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return false;
  }
  
  // Check length
  if (filePath.length > 500) {
    return false;
  }
  
  // Check for dangerous patterns
  const dangerousPatterns = [
    /\.git(\/|$)/i,
    /\/\.git(\/|$)/i,
    /^\.git(\/|$)/i,
    /\.\.(\/|$)/,
    /\/\.\.(\/|$)/,
    /^\.\.(\/|$)/,
    /\/\/+/,
    /^\//,
    /\/$/,
    /[<>:"|?*]/,
    /^\s|\s$/,
    /\0/
  ];
  
  for (const pattern of dangerousPatterns) {
    if (pattern.test(filePath)) {
      return false;
    }
  }
  
  // Check for reserved names (Windows)
  const reservedNames = [
    'CON', 'PRN', 'AUX', 'NUL',
    'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
    'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
  ];
  
  const fileName = path.basename(filePath).toUpperCase().replace(/\..*$/, '');
  if (reservedNames.includes(fileName)) {
    return false;
  }
  
  // Check file extension
  const ext = path.extname(filePath).toLowerCase();
  const blockedExtensions = [
    '.exe', '.bat', '.cmd', '.sh', '.bin',
    '.dll', '.so', '.dylib', '.sys',
    '.php', '.php3', '.php4', '.php5', '.phtml',
    '.py', '.pyc', '.pyo', '.pyw',
    '.pl', '.pm', '.t', '.cgi',
    '.js', '.jse', '.vbs', '.vbe', '.wsf',
    '.jar', '.war', '.ear', '.class'
  ];
  
  if (blockedExtensions.includes(ext)) {
    return false;
  }
  
  return true;
}

export function getParentDirectory(filePath) {
  const sanitized = sanitizePath(filePath);
  const lastSlash = sanitized.lastIndexOf('/');
  
  if (lastSlash === -1) {
    return '';
  }
  
  return sanitized.substring(0, lastSlash);
}

export function getSafeFileName(originalName, counter = 0) {
  const baseName = path.basename(originalName, path.extname(originalName));
  const ext = path.extname(originalName);
  
  let safeName = baseName
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/^_+|_+$/g, '');
  
  if (safeName.length === 0) {
    safeName = 'file';
  }
  
  const suffix = counter > 0 ? `_${counter}` : '';
  return `${safeName}${suffix}${ext}`;
}
