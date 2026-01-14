import React, { useState, useEffect, useRef } from 'react';
import { createSSEConnection, getUploadStatus, cancelUpload } from '../services/api';

function ProgressBar({ sessionId, fileCount, onComplete, onError }) {
  const [progress, setProgress] = useState({
    percentage: 0,
    completed: 0,
    failed: 0,
    total: fileCount,
    currentFile: null,
    status: 'initializing'
  });
  
  const [rateLimit, setRateLimit] = useState(null);
  const [logs, setLogs] = useState([]);
  const [uploadStats, setUploadStats] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  
  const eventSourceRef = useRef(null);
  const logsEndRef = useRef(null);

  useEffect(() => {
    startProgressTracking();
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [sessionId]);

  useEffect(() => {
    // Auto-scroll logs to bottom
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const startProgressTracking = async () => {
    try {
      // First, get initial status
      const status = await getUploadStatus(sessionId);
      updateProgressFromStatus(status);
      
      // Connect to SSE for real-time updates
      eventSourceRef.current = createSSEConnection(sessionId);
      
      eventSourceRef.current.onopen = () => {
        addLog('Connected to upload server', 'info');
      };
      
      eventSourceRef.current.addEventListener('connected', (event) => {
        const data = JSON.parse(event.data);
        addLog(`Session ${data.sessionId} connected`, 'info');
      });
      
      eventSourceRef.current.addEventListener('jobStart', (event) => {
        const data = JSON.parse(event.data);
        setProgress(prev => ({
          ...prev,
          currentFile: data.filePath,
          status: 'uploading'
        }));
        addLog(`Starting: ${data.filePath}`, 'info');
      });
      
      eventSourceRef.current.addEventListener('jobComplete', (event) => {
        const data = JSON.parse(event.data);
        setProgress(prev => ({
          ...prev,
          completed: data.stats.completed,
          percentage: ((data.stats.completed + data.stats.failed) / prev.total) * 100,
          currentFile: null
        }));
        addLog(`Completed: ${data.filePath}`, 'success');
        
        // Check if all files are done
        if (data.stats.completed + data.stats.failed >= prev.total) {
          setProgress(prev => ({ ...prev, status: 'completed' }));
          addLog('All files uploaded successfully!', 'success');
          setTimeout(() => onComplete(), 2000);
        }
      });
      
      eventSourceRef.current.addEventListener('jobError', (event) => {
        const data = JSON.parse(event.data);
        setProgress(prev => ({
          ...prev,
          failed: prev.failed + 1,
          percentage: ((prev.completed + prev.failed + 1) / prev.total) * 100
        }));
        addLog(`Failed: ${data.filePath} - ${data.error}`, 'error');
      });
      
      eventSourceRef.current.addEventListener('rateLimitWarning', (event) => {
        const data = JSON.parse(event.data);
        setRateLimit({
          warning: true,
          remaining: data.remaining,
          resetTime: data.resetTime,
          resetIn: Math.ceil(data.resetIn / 1000)
        });
        addLog(`Rate limit warning: ${data.remaining} requests remaining`, 'warning');
      });
      
      eventSourceRef.current.addEventListener('rateLimitExceeded', (event) => {
        const data = JSON.parse(event.data);
        setRateLimit({
          exceeded: true,
          resetTime: data.resetTime,
          waitTime: Math.ceil(data.waitTime / 1000)
        });
        setProgress(prev => ({ ...prev, status: 'rate_limited' }));
        addLog(`Rate limit exceeded. Waiting ${Math.ceil(data.waitTime / 1000)} seconds...`, 'warning');
      });
      
      eventSourceRef.current.addEventListener('rateLimitResumed', () => {
        setRateLimit(null);
        setProgress(prev => ({ ...prev, status: 'uploading' }));
        addLog('Rate limit reset, resuming uploads', 'info');
      });
      
      eventSourceRef.current.onerror = (error) => {
        console.error('SSE error:', error);
        addLog('Connection lost, attempting to reconnect...', 'error');
        
        // Attempt to reconnect
        setTimeout(() => {
          if (eventSourceRef.current) {
            eventSourceRef.current.close();
          }
          startProgressTracking();
        }, 5000);
      };
      
    } catch (error) {
      console.error('Failed to start progress tracking:', error);
      onError('Failed to track upload progress');
    }
  };

  const updateProgressFromStatus = (status) => {
    setProgress({
      percentage: status.progress || 0,
      completed: status.stats?.completed || 0,
      failed: status.stats?.failed || 0,
      total: status.stats?.total || fileCount,
      currentFile: null,
      status: status.status || 'pending'
    });
    
    setUploadStats(status.stats);
  };

  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev.slice(-50), { timestamp, message, type }]);
  };

  const handleCancel = async () => {
    if (!window.confirm('Are you sure you want to cancel this upload?')) {
      return;
    }
    
    try {
      setCancelling(true);
      await cancelUpload(sessionId);
      addLog('Upload cancelled by user', 'warning');
      onComplete();
    } catch (error) {
      console.error('Failed to cancel upload:', error);
      onError('Failed to cancel upload');
    } finally {
      setCancelling(false);
    }
  };

  const getStatusColor = () => {
    switch (progress.status) {
      case 'completed': return '#10b981';
      case 'uploading': return '#3b82f6';
      case 'rate_limited': return '#f59e0b';
      case 'failed': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const getStatusText = () => {
    switch (progress.status) {
      case 'completed': return 'Upload Complete';
      case 'uploading': return 'Uploading Files';
      case 'rate_limited': return 'Rate Limited - Paused';
      case 'failed': return 'Upload Failed';
      default: return 'Preparing Upload';
    }
  };

  return (
    <div className="progress-container">
      <div className="progress-header">
        <h2>Upload Progress</h2>
        <div className="status-badge" style={{ backgroundColor: getStatusColor() }}>
          {getStatusText()}
        </div>
      </div>
      
      {rateLimit && (
        <div className="rate-limit-alert">
          <div className="alert-icon">⚠️</div>
          <div className="alert-content">
            {rateLimit.exceeded ? (
              <>
                <strong>Rate Limit Exceeded</strong>
                <p>
                  GitHub API rate limit reached. Upload paused for {rateLimit.waitTime} seconds.
                  Will resume at {new Date(rateLimit.resetTime).toLocaleTimeString()}.
                </p>
              </>
            ) : (
              <>
                <strong>Rate Limit Warning</strong>
                <p>
                  {rateLimit.remaining} requests remaining. 
                  Limit resets at {new Date(rateLimit.resetTime).toLocaleTimeString()}.
                </p>
              </>
            )}
          </div>
        </div>
      )}
      
      <div className="progress-stats">
        <div className="stat-card">
          <div className="stat-value">{progress.completed}</div>
          <div className="stat-label">Completed</div>
        </div>
        
        <div className="stat-card">
          <div className="stat-value">{progress.failed}</div>
          <div className="stat-label">Failed</div>
        </div>
        
        <div className="stat-card">
          <div className="stat-value">{progress.total}</div>
          <div className="stat-label">Total</div>
        </div>
        
        <div className="stat-card">
          <div className="stat-value">{progress.percentage.toFixed(1)}%</div>
          <div className="stat-label">Progress</div>
        </div>
      </div>
      
      <div className="progress-bar-wrapper">
        <div 
          className="progress-bar-fill"
          style={{
            width: `${progress.percentage}%`,
            backgroundColor: getStatusColor()
          }}
        ></div>
      </div>
      
      {progress.currentFile && (
        <div className="current-file">
          <div className="current-file-label">Current File:</div>
          <div className="current-file-path">{progress.currentFile}</div>
        </div>
      )}
      
      <div className="progress-actions">
        <button
          onClick={handleCancel}
          disabled={cancelling || progress.status === 'completed'}
          className="cancel-button"
        >
          {cancelling ? 'Cancelling...' : 'Cancel Upload'}
        </button>
      </div>
      
      <div className="upload-logs">
        <div className="logs-header">
          <h3>Upload Logs</h3>
          <button 
            onClick={() => setLogs([])}
            className="clear-logs"
          >
            Clear Logs
          </button>
        </div>
        
        <div className="logs-container">
          {logs.map((log, index) => (
            <div 
              key={index} 
              className={`log-entry log-${log.type}`}
            >
              <span className="log-time">[{log.timestamp}]</span>
              <span className="log-message">{log.message}</span>
            </div>
          ))}
          <div ref={logsEndRef} />
        </div>
      </div>
      
      {uploadStats && (
        <div className="upload-details">
          <h4>Upload Details</h4>
          <div className="details-grid">
            <div className="detail-item">
              <span className="detail-label">Queue Size:</span>
              <span className="detail-value">{uploadStats.queue?.queueSize || 0}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Active Jobs:</span>
              <span className="detail-value">{uploadStats.queue?.activeJobs || 0}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Rate Limit Hits:</span>
              <span className="detail-value">{uploadStats.queue?.rateLimitHits || 0}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProgressBar;
