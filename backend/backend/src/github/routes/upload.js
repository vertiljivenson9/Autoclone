import express from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import GitHubAuth from '../github/auth.js';
import uploadQueue from '../services/uploadQueue.js';
import { extractZip, cleanupTemp } from '../utils/zipExtractor.js';
import { sanitizePath, isValidPath } from '../utils/pathSanitizer.js';

const router = express.Router();

// Configure multer for file upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: parseInt(process.env.MAX_UPLOAD_SIZE) || 100 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    // Allow ZIP files and any other files (for folder uploads)
    const allowedMimeTypes = [
      'application/zip',
      'application/x-zip-compressed',
      'multipart/x-zip'
    ];
    
    if (file.mimetype === 'application/octet-stream' && file.originalname.endsWith('.zip')) {
      return cb(null, true);
    }
    
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only ZIP files are allowed.'));
    }
  }
});

// Middleware to require installation
const requireInstallation = (req, res, next) => {
  if (!req.session.installationId) {
    return res.status(401).json({ 
      error: 'GitHub App not installed. Please install the app first.',
      code: 'NOT_INSTALLED'
    });
  }
  req.installationId = req.session.installationId;
  next();
};

// Start upload session
router.post('/start', requireInstallation, upload.single('file'), async (req, res) => {
  try {
    const { owner, repo, branch, basePath = '', commitMessage = 'Upload files' } = req.body;
    const file = req.file;
    
    // Validate required fields
    if (!owner || !repo) {
      return res.status(400).json({ error: 'Owner and repository name are required' });
    }
    
    if (!file) {
      return res.status(400).json({ error: 'No file provided' });
    }
    
    // Validate branch
    const targetBranch = branch || 'main';
    
    // Get installation token
    const installationToken = await GitHubAuth.getInstallationToken(req.installationId);
    
    let files = [];
    let tempId = null;
    
    // Process ZIP file
    if (file.originalname.endsWith('.zip') || file.mimetype.includes('zip')) {
      const result = await extractZip(file.buffer, basePath);
      files = result.files;
      tempId = result.tempId;
    } else {
      // Single file upload (though this route should only accept ZIPs for folders)
      return res.status(400).json({ 
        error: 'Only ZIP files are accepted for folder uploads. Use single file upload endpoint for individual files.' 
      });
    }
    
    // Validate all file paths
    const validFiles = files.filter(file => {
      if (!isValidPath(file.path)) {
        console.warn(`Skipping invalid path: ${file.path}`);
        return false;
      }
      return true;
    });
    
    if (validFiles.length === 0) {
      return res.status(400).json({ error: 'No valid files found in upload' });
    }
    
    // Create upload session
    const sessionId = uuidv4();
    
    // Store session data (in production, use Redis or database)
    req.app.locals.sessions = req.app.locals.sessions || new Map();
    req.app.locals.sessions.set(sessionId, {
      files: validFiles,
      config: {
        owner,
        repo,
        branch: targetBranch,
        basePath,
        commitMessage,
        installationToken,
        installationId: req.installationId
      },
      tempId,
      startedAt: new Date().toISOString(),
      status: 'pending',
      stats: {
        total: validFiles.length,
        completed: 0,
        failed: 0
      }
    });
    
    res.json({
      success: true,
      sessionId,
      fileCount: validFiles.length,
      totalSize: validFiles.reduce((sum, file) => sum + file.size, 0),
      files: validFiles.map(f => ({
        path: f.path,
        size: f.size,
        type: 'file'
      }))
    });
    
  } catch (error) {
    console.error('Upload start error:', error);
    
    // Clean up temp files if they exist
    if (error.tempId) {
      await cleanupTemp(error.tempId);
    }
    
    const status = error.status || 500;
    const message = error.message || 'Failed to process upload';
    
    res.status(status).json({ 
      error: message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Execute upload
router.post('/execute/:sessionId', requireInstallation, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const sessions = req.app.locals.sessions;
    
    if (!sessions || !sessions.has(sessionId)) {
      return res.status(404).json({ error: 'Upload session not found' });
    }
    
    const session = sessions.get(sessionId);
    
    // Validate session belongs to current installation
    if (session.config.installationId !== req.installationId) {
      return res.status(403).json({ error: 'Access denied to this upload session' });
    }
    
    // Update session status
    session.status = 'uploading';
    
    // Add all files to upload queue
    const uploadPromises = session.files.map((file, index) => {
      return uploadQueue.addUploadJob({
        path: file.path,
        content: file.content,
        encoding: 'base64',
        message: session.config.commitMessage || `Add ${file.path}`,
        priority: index
      }, session.config, sessionId);
    });
    
    res.json({
      success: true,
      sessionId,
      message: `Started uploading ${session.files.length} files`,
      queueSize: uploadQueue.getQueueSize()
    });
    
    // Cleanup after completion
    Promise.allSettled(uploadPromises).then(async () => {
      if (session.tempId) {
        await cleanupTemp(session.tempId);
      }
      session.status = 'completed';
      session.completedAt = new Date().toISOString();
    });
    
  } catch (error) {
    console.error('Upload execute error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get upload status
router.get('/status/:sessionId', requireInstallation, (req, res) => {
  const { sessionId } = req.params;
  const sessions = req.app.locals.sessions;
  
  if (!sessions || !sessions.has(sessionId)) {
    return res.status(404).json({ error: 'Upload session not found' });
  }
  
  const session = sessions.get(sessionId);
  
  // Check access
  if (session.config.installationId !== req.installationId) {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  const queueStats = uploadQueue.getStats();
  const sessionStats = session.stats;
  
  const progress = sessionStats.total > 0 
    ? ((sessionStats.completed + sessionStats.failed) / sessionStats.total) * 100 
    : 0;
  
  res.json({
    sessionId,
    status: session.status,
    progress: Math.min(progress, 100),
    stats: {
      ...sessionStats,
      queue: queueStats
    },
    startedAt: session.startedAt,
    completedAt: session.completedAt,
    config: {
      owner: session.config.owner,
      repo: session.config.repo,
      branch: session.config.branch,
      fileCount: session.files.length
    }
  });
});

// Cancel upload
router.post('/cancel/:sessionId', requireInstallation, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const sessions = req.app.locals.sessions;
    
    if (!sessions || !sessions.has(sessionId)) {
      return res.status(404).json({ error: 'Upload session not found' });
    }
    
    const session = sessions.get(sessionId);
    
    if (session.config.installationId !== req.installationId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Update session status
    session.status = 'cancelled';
    session.cancelledAt = new Date().toISOString();
    
    // Cleanup temp files
    if (session.tempId) {
      await cleanupTemp(session.tempId);
    }
    
    res.json({
      success: true,
      sessionId,
      message: 'Upload cancelled successfully'
    });
    
  } catch (error) {
    console.error('Cancel error:', error);
    res.status(500).json({ error: 'Failed to cancel upload' });
  }
});

export default router;
