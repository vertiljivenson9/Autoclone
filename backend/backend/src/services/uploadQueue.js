import { EventEmitter } from 'events';
import PQueue from 'p-queue';
import axios from 'axios';

class UploadQueue extends EventEmitter {
  constructor() {
    super();
    this.queue = new PQueue({
      concurrency: parseInt(process.env.UPLOAD_CONCURRENCY) || 3,
      timeout: 300000,
      throwOnTimeout: false
    });
    
    this.activeUploads = new Map();
    this.stats = {
      totalJobs: 0,
      completedJobs: 0,
      failedJobs: 0,
      rateLimitHits: 0
    };
  }

  async addUploadJob(fileData, repoConfig, sessionId) {
    const jobId = `${sessionId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const job = async () => {
      this.activeUploads.set(jobId, {
        filePath: fileData.path,
        sessionId,
        startTime: Date.now()
      });
      
      try {
        this.emit('jobStart', { 
          jobId, 
          sessionId, 
          filePath: fileData.path,
          timestamp: new Date().toISOString()
        });
        
        // GitHub API: Create or update file
        const endpoint = `https://api.github.com/repos/${repoConfig.owner}/${repoConfig.repo}/contents/${encodeURIComponent(fileData.path)}`;
        
        // Prepare request data
        const requestData = {
          message: fileData.message || `Upload ${fileData.path}`,
          content: fileData.content,
          branch: repoConfig.branch
        };
        
        // Check if file exists to get SHA (for updates)
        try {
          const existingResponse = await axios.get(endpoint, {
            headers: {
              'Accept': 'application/vnd.github+json',
              'Authorization': `Bearer ${repoConfig.installationToken}`,
              'X-GitHub-Api-Version': '2022-11-28'
            },
            params: {
              ref: repoConfig.branch
            }
          });
          
          requestData.sha = existingResponse.data.sha;
        } catch (error) {
          // File doesn't exist, which is fine for new files
          if (error.response?.status !== 404) {
            throw error;
          }
        }
        
        // Upload file
        const response = await axios.put(endpoint, requestData, {
          headers: {
            'Accept': 'application/vnd.github+json',
            'Authorization': `Bearer ${repoConfig.installationToken}`,
            'X-GitHub-Api-Version': '2022-11-28'
          }
        });
        
        // Check rate limits
        this.checkRateLimits(response.headers);
        
        const duration = Date.now() - this.activeUploads.get(jobId).startTime;
        
        this.stats.completedJobs++;
        
        this.emit('jobComplete', {
          jobId,
          sessionId,
          filePath: fileData.path,
          duration,
          result: {
            sha: response.data.content.sha,
            url: response.data.content.html_url
          },
          timestamp: new Date().toISOString()
        });
        
        return response.data;
        
      } catch (error) {
        this.stats.failedJobs++;
        
        const errorData = {
          jobId,
          sessionId,
          filePath: fileData.path,
          error: error.message,
          status: error.response?.status,
          headers: error.response?.headers,
          timestamp: new Date().toISOString()
        };
        
        // Handle rate limits specifically
        if (error.response?.status === 403 && error.response.headers['x-ratelimit-remaining'] === '0') {
          this.stats.rateLimitHits++;
          this.handleRateLimitExceeded(error.response.headers);
        }
        
        this.emit('jobError', errorData);
        throw error;
        
      } finally {
        this.activeUploads.delete(jobId);
      }
    };
    
    this.stats.totalJobs++;
    return this.queue.add(job, { 
      priority: fileData.priority || 0 
    });
  }
  
  checkRateLimits(headers) {
    const remaining = parseInt(headers['x-ratelimit-remaining']);
    const limit = parseInt(headers['x-ratelimit-limit']);
    const resetTime = parseInt(headers['x-ratelimit-reset']) * 1000;
    
    if (remaining < 10) {
      this.emit('rateLimitWarning', {
        remaining,
        limit,
        resetTime: new Date(resetTime).toISOString(),
        resetIn: Math.max(0, resetTime - Date.now())
      });
    }
  }
  
  handleRateLimitExceeded(headers) {
    const resetTime = parseInt(headers['x-ratelimit-reset']) * 1000;
    const waitTime = Math.max(1000, resetTime - Date.now() + 1000);
    
    this.emit('rateLimitExceeded', {
      resetTime: new Date(resetTime).toISOString(),
      waitTime,
      timestamp: new Date().toISOString()
    });
    
    // Pause queue until rate limit resets
    this.queue.pause();
    setTimeout(() => {
      this.queue.start();
      this.emit('rateLimitResumed', {
        timestamp: new Date().toISOString()
      });
    }, waitTime);
  }
  
  getStats() {
    return {
      ...this.stats,
      activeJobs: this.activeUploads.size,
      pendingJobs: this.queue.pending,
      queueSize: this.queue.size
    };
  }
  
  getQueueSize() {
    return this.queue.size + this.queue.pending;
  }
  
  clearStats() {
    this.stats = {
      totalJobs: 0,
      completedJobs: 0,
      failedJobs: 0,
      rateLimitHits: 0
    };
  }
  
  pause() {
    this.queue.pause();
  }
  
  start() {
    this.queue.start();
  }
  
  clear() {
    this.queue.clear();
    this.activeUploads.clear();
    this.clearStats();
  }
}

// Server-Sent Events setup
export function setupSSE(req, res) {
  const { sessionId } = req.params;
  
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  
  // Send initial connection event
  res.write(`event: connected\ndata: ${JSON.stringify({ 
    sessionId, 
    timestamp: new Date().toISOString() 
  })}\n\n`);
  
  const uploadQueue = new UploadQueue();
  
  // Event listeners
  const eventHandlers = {
    jobStart: (data) => {
      if (data.sessionId === sessionId) {
        res.write(`event: jobStart\ndata: ${JSON.stringify(data)}\n\n`);
      }
    },
    jobComplete: (data) => {
      if (data.sessionId === sessionId) {
        res.write(`event: jobComplete\ndata: ${JSON.stringify(data)}\n\n`);
      }
    },
    jobError: (data) => {
      if (data.sessionId === sessionId) {
        res.write(`event: jobError\ndata: ${JSON.stringify(data)}\n\n`);
      }
    },
    rateLimitWarning: (data) => {
      res.write(`event: rateLimitWarning\ndata: ${JSON.stringify(data)}\n\n`);
    },
    rateLimitExceeded: (data) => {
      res.write(`event: rateLimitExceeded\ndata: ${JSON.stringify(data)}\n\n`);
    },
    rateLimitResumed: (data) => {
      res.write(`event: rateLimitResumed\ndata: ${JSON.stringify(data)}\n\n`);
    }
  };
  
  // Register event listeners
  Object.entries(eventHandlers).forEach(([event, handler]) => {
    uploadQueue.on(event, handler);
  });
  
  // Keep-alive ping
  const keepAlive = setInterval(() => {
    res.write(`: ping\n\n`);
  }, 30000);
  
  // Client disconnect cleanup
  req.on('close', () => {
    clearInterval(keepAlive);
    Object.keys(eventHandlers).forEach(event => {
      uploadQueue.off(event, eventHandlers[event]);
    });
    res.end();
  });
}

export default new UploadQueue();
