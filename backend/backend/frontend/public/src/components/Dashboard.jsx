import React, { useState, useEffect } from 'react';
import UploadBox from './UploadBox';
import RepoSelector from './RepoSelector';
import { getRepositories } from '../services/api';

function Dashboard({ repositories: initialRepositories, onUploadStart, onRefreshRepos }) {
  const [repositories, setRepositories] = useState(initialRepositories || []);
  const [loading, setLoading] = useState(!initialRepositories);
  const [selectedRepo, setSelectedRepo] = useState(null);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [uploadConfig, setUploadConfig] = useState({
    basePath: '',
    commitMessage: 'Upload files via GitHub Folder Uploader'
  });

  useEffect(() => {
    if (!initialRepositories) {
      loadRepositories();
    }
  }, []);

  const loadRepositories = async () => {
    try {
      setLoading(true);
      const repos = await getRepositories();
      setRepositories(repos);
      if (onRefreshRepos) {
        onRefreshRepos(repos);
      }
    } catch (error) {
      console.error('Failed to load repositories:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRepoSelect = (repo) => {
    setSelectedRepo(repo);
    setSelectedBranch(repo.default_branch || 'main');
  };

  const handleUploadReady = (files) => {
    if (!selectedRepo) {
      alert('Please select a repository first');
      return;
    }

    const [owner, repoName] = selectedRepo.full_name.split('/');
    
    onUploadStart({
      files,
      config: {
        owner,
        repo: repoName,
        branch: selectedBranch,
        ...uploadConfig
      }
    });
  };

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="spinner"></div>
        <p>Loading your repositories...</p>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h2>Upload to GitHub</h2>
        <button 
          onClick={loadRepositories}
          className="refresh-button"
          title="Refresh repositories"
        >
          ↻
        </button>
      </div>

      <div className="dashboard-content">
        <div className="repo-section">
          <RepoSelector
            repositories={repositories}
            selectedRepo={selectedRepo}
            selectedBranch={selectedBranch}
            onRepoSelect={handleRepoSelect}
            onBranchSelect={setSelectedBranch}
          />
        </div>

        {selectedRepo && (
          <div className="upload-section">
            <div className="upload-config">
              <h3>Upload Configuration</h3>
              
              <div className="form-group">
                <label htmlFor="basePath">Target Directory (optional):</label>
                <input
                  type="text"
                  id="basePath"
                  value={uploadConfig.basePath}
                  onChange={(e) => setUploadConfig(prev => ({
                    ...prev,
                    basePath: e.target.value
                  }))}
                  placeholder="e.g., src/components/"
                />
                <small className="form-help">
                  Leave empty to upload to repository root
                </small>
              </div>

              <div className="form-group">
                <label htmlFor="commitMessage">Commit Message:</label>
                <textarea
                  id="commitMessage"
                  value={uploadConfig.commitMessage}
                  onChange={(e) => setUploadConfig(prev => ({
                    ...prev,
                    commitMessage: e.target.value
                  }))}
                  rows="3"
                  placeholder="Describe your changes..."
                />
              </div>
            </div>

            <div className="upload-area">
              <UploadBox
                onFilesSelected={handleUploadReady}
                maxSize={100 * 1024 * 1024} // 100MB
                acceptedFiles={['.zip']}
                disabled={!selectedRepo}
              />
            </div>

            <div className="upload-info">
              <h4>Supported uploads:</h4>
              <ul>
                <li>ZIP archives containing folders and files</li>
                <li>Maximum size: 100MB per upload</li>
                <li>Files will maintain their directory structure</li>
                <li>GitHub rate limits apply (approx. 60 uploads/minute)</li>
              </ul>
            </div>
          </div>
        )}

        {!selectedRepo && repositories.length > 0 && (
          <div className="repo-prompt">
            <div className="prompt-icon">📁</div>
            <h3>Select a Repository</h3>
            <p>Choose a repository from the list to start uploading files</p>
          </div>
        )}

        {repositories.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">🏗️</div>
            <h3>No Repositories Found</h3>
            <p>
              The GitHub App doesn't have access to any repositories yet.
              Make sure the app is installed on an account or organization with repositories.
            </p>
            <button 
              onClick={loadRepositories}
              className="retry-button"
            >
              Check Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;
