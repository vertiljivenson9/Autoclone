import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './components/Dashboard';
import UploadBox from './components/UploadBox';
import ProgressBar from './components/ProgressBar';
import { checkInstallation, getRepositories } from './services/api';
import './styles/main.css';

function App() {
  const [installed, setInstalled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [repositories, setRepositories] = useState([]);
  const [uploadSession, setUploadSession] = useState(null);

  useEffect(() => {
    checkInstallationStatus();
  }, []);

  const checkInstallationStatus = async () => {
    try {
      setLoading(true);
      const installationStatus = await checkInstallation();
      
      if (installationStatus.installed) {
        setInstalled(true);
        await loadRepositories();
      } else {
        setInstalled(false);
      }
    } catch (err) {
      console.error('Failed to check installation:', err);
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  const loadRepositories = async () => {
    try {
      const repos = await getRepositories();
      setRepositories(repos);
    } catch (err) {
      console.error('Failed to load repositories:', err);
      setError('Failed to load repositories');
    }
  };

  const handleInstallSuccess = () => {
    setInstalled(true);
    loadRepositories();
  };

  const handleUploadStart = (sessionData) => {
    setUploadSession(sessionData);
  };

  const handleUploadComplete = () => {
    setUploadSession(null);
    setError(null);
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner"></div>
        <p>Loading GitHub Folder Uploader...</p>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="container">
          <h1>GitHub Folder Uploader</h1>
          <p className="subtitle">
            Upload folders and ZIP files directly to your GitHub repositories
          </p>
        </div>
      </header>

      <main className="app-main">
        <div className="container">
          {error && (
            <div className="error-banner">
              <span>{error}</span>
              <button 
                onClick={() => setError(null)}
                className="close-button"
              >
                ×
              </button>
            </div>
          )}

          <Routes>
            <Route 
              path="/" 
              element={
                <Navigate to="/dashboard" replace />
              } 
            />
            
            <Route 
              path="/dashboard" 
              element={
                installed ? (
                  <Dashboard 
                    repositories={repositories}
                    onUploadStart={handleUploadStart}
                    onRefreshRepos={loadRepositories}
                  />
                ) : (
                  <div className="install-prompt">
                    <h2>Welcome to GitHub Folder Uploader</h2>
                    <p>
                      This application allows you to upload entire folders or ZIP files 
                      directly to your GitHub repositories using GitHub App authentication.
                    </p>
                    
                    <div className="install-steps">
                      <div className="step">
                        <div className="step-number">1</div>
                        <div className="step-content">
                          <h3>Install GitHub App</h3>
                          <p>Install the app on your GitHub account or organization</p>
                        </div>
                      </div>
                      
                      <div className="step">
                        <div className="step-number">2</div>
                        <div className="step-content">
                          <h3>Select Repository</h3>
                          <p>Choose where to upload your files</p>
                        </div>
                      </div>
                      
                      <div className="step">
                        <div className="step-number">3</div>
                        <div className="step-content">
                          <h3>Upload Files</h3>
                          <p>Drag & drop folders or ZIP files</p>
                        </div>
                      </div>
                    </div>
                    
                    <button 
                      onClick={() => window.location.href = '/dashboard/install'}
                      className="install-button"
                    >
                      Get Started
                    </button>
                  </div>
                )
              } 
            />
            
            <Route 
              path="/dashboard/install" 
              element={
                <InstallFlow 
                  onInstallSuccess={handleInstallSuccess}
                  onError={setError}
                />
              } 
            />
            
            <Route 
              path="/upload" 
              element={
                uploadSession ? (
                  <UploadProgress 
                    sessionId={uploadSession.sessionId}
                    fileCount={uploadSession.fileCount}
                    onComplete={handleUploadComplete}
                    onError={setError}
                  />
                ) : (
                  <Navigate to="/dashboard" replace />
                )
              } 
            />
          </Routes>
        </div>
      </main>

      <footer className="app-footer">
        <div className="container">
          <p>
            Using GitHub App authentication • 
            <a 
              href={`https://github.com/apps/${process.env.REACT_APP_GITHUB_APP_SLUG}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              About the GitHub App
            </a>
          </p>
          <p className="copyright">
            GitHub Folder Uploader © {new Date().getFullYear()} • 
            Not affiliated with GitHub, Inc.
          </p>
        </div>
      </footer>
    </div>
  );
}

function InstallFlow({ onInstallSuccess, onError }) {
  const [loading, setLoading] = useState(false);
  const [installUrl, setInstallUrl] = useState(null);

  useEffect(() => {
    startInstallation();
  }, []);

  const startInstallation = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${process.env.REACT_APP_API_URL}/api/install/start`, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to start installation');
      }
      
      const data = await response.json();
      setInstallUrl(data.installUrl);
    } catch (err) {
      onError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="install-flow">
        <div className="loading-spinner"></div>
        <p>Preparing installation...</p>
      </div>
    );
  }

  return (
    <div className="install-flow">
      <h2>Install GitHub App</h2>
      
      {installUrl && (
        <>
          <div className="install-info">
            <p>
              You'll be redirected to GitHub to install the app. 
              After installation, you'll return to this application.
            </p>
            
            <div className="permissions-list">
              <h4>Permissions requested:</h4>
              <ul>
                <li>
                  <strong>Repository contents:</strong> Read & write access
                </li>
                <li>
                  <strong>Repository metadata:</strong> Read-only access
                </li>
              </ul>
            </div>
          </div>
          
          <div className="install-actions">
            <button
              onClick={() => window.location.href = installUrl}
              className="install-button"
            >
              Install GitHub App
            </button>
            
            <button
              onClick={() => window.history.back()}
              className="cancel-button"
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function UploadProgress({ sessionId, fileCount, onComplete, onError }) {
  // Implementation would connect to SSE and show progress
  return (
    <div className="upload-progress-view">
      <ProgressBar 
        sessionId={sessionId}
        fileCount={fileCount}
        onComplete={onComplete}
        onError={onError}
      />
    </div>
  );
}

export default App;
