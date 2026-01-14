import React, { useState, useEffect } from 'react';
import { getBranches } from '../services/api';

function RepoSelector({ repositories, selectedRepo, selectedBranch, onRepoSelect, onBranchSelect }) {
  const [filter, setFilter] = useState('');
  const [branches, setBranches] = useState([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [groupedRepos, setGroupedRepos] = useState({});

  useEffect(() => {
    if (selectedRepo) {
      loadBranches(selectedRepo);
    } else {
      setBranches([]);
    }
  }, [selectedRepo]);

  useEffect(() => {
    // Group repositories by owner
    const grouped = repositories.reduce((groups, repo) => {
      const owner = repo.owner;
      if (!groups[owner]) {
        groups[owner] = [];
      }
      groups[owner].push(repo);
      return groups;
    }, {});
    
    setGroupedRepos(grouped);
  }, [repositories]);

  const loadBranches = async (repo) => {
    try {
      setLoadingBranches(true);
      const [owner, repoName] = repo.full_name.split('/');
      const branchList = await getBranches(owner, repoName);
      setBranches(branchList);
      
      // Set default branch if not already selected
      if (!selectedBranch && branchList.length > 0) {
        const defaultBranch = branchList.find(b => b.name === repo.default_branch) || branchList[0];
        onBranchSelect(defaultBranch.name);
      }
    } catch (error) {
      console.error('Failed to load branches:', error);
      setBranches([]);
    } finally {
      setLoadingBranches(false);
    }
  };

  const filteredRepos = repositories.filter(repo => 
    repo.name.toLowerCase().includes(filter.toLowerCase()) ||
    repo.owner.toLowerCase().includes(filter.toLowerCase()) ||
    repo.full_name.toLowerCase().includes(filter.toLowerCase())
  );

  const handleRepoClick = (repo) => {
    onRepoSelect(repo);
  };

  return (
    <div className="repo-selector">
      <div className="repo-search">
        <input
          type="text"
          placeholder="Search repositories..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="search-input"
        />
        <span className="search-count">
          {filteredRepos.length} of {repositories.length} repos
        </span>
      </div>

      <div className="repo-list-container">
        {Object.entries(groupedRepos).map(([owner, ownerRepos]) => {
          const filteredOwnerRepos = ownerRepos.filter(repo => 
            filteredRepos.some(r => r.id === repo.id)
          );

          if (filteredOwnerRepos.length === 0) return null;

          return (
            <div key={owner} className="owner-group">
              <div className="owner-header">
                <span className="owner-avatar">
                  {owner.charAt(0).toUpperCase()}
                </span>
                <span className="owner-name">{owner}</span>
                <span className="owner-count">({filteredOwnerRepos.length})</span>
              </div>
              
              <div className="repo-list">
                {filteredOwnerRepos.map(repo => (
                  <div
                    key={repo.id}
                    className={`repo-item ${selectedRepo?.id === repo.id ? 'selected' : ''}`}
                    onClick={() => handleRepoClick(repo)}
                  >
                    <div className="repo-icon">
                      {repo.private ? '🔒' : '📂'}
                    </div>
                    
                    <div className="repo-info">
                      <div className="repo-name">
                        {repo.name}
                        {repo.private && <span className="private-badge">Private</span>}
                      </div>
                      
                      <div className="repo-meta">
                        <span className="repo-branch">
                          Default: {repo.default_branch}
                        </span>
                        <span className="repo-updated">
                          Updated: {new Date(repo.updated_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    
                    {selectedRepo?.id === repo.id && (
                      <div className="selected-indicator">✓</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {filteredRepos.length === 0 && (
          <div className="no-results">
            <p>No repositories found matching "{filter}"</p>
            <button 
              onClick={() => setFilter('')}
              className="clear-filter"
            >
              Clear search
            </button>
          </div>
        )}
      </div>

      {selectedRepo && (
        <div className="branch-selector">
          <h4>Select Branch</h4>
          
          {loadingBranches ? (
            <div className="loading-branches">
              <div className="spinner small"></div>
              <span>Loading branches...</span>
            </div>
          ) : (
            <div className="branch-list">
              {branches.map(branch => (
                <div
                  key={branch.name}
                  className={`branch-item ${selectedBranch === branch.name ? 'selected' : ''}`}
                  onClick={() => onBranchSelect(branch.name)}
                >
                  <span className="branch-name">
                    {branch.name}
                    {branch.protected && <span className="protected-badge">Protected</span>}
                  </span>
                  
                  {selectedBranch === branch.name && (
                    <span className="selected-indicator">→</span>
                  )}
                </div>
              ))}
              
              {branches.length === 0 && (
                <div className="no-branches">
                  No branches found or access denied
                </div>
              )}
            </div>
          )}
          
          <div className="selected-repo-info">
            <strong>Selected:</strong> {selectedRepo.full_name}
            {selectedBranch && ` → ${selectedBranch}`}
          </div>
        </div>
      )}
    </div>
  );
}

export default RepoSelector;
