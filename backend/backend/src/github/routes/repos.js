import express from 'express';
import axios from 'axios';
import GitHubAuth from '../github/auth.js';

const router = express.Router();

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

// Get all repositories accessible to the installation
router.get('/', requireInstallation, async (req, res) => {
  try {
    const token = await GitHubAuth.getInstallationToken(req.installationId);
    
    let allRepos = [];
    let page = 1;
    const perPage = 100;
    
    // Handle pagination
    while (true) {
      const response = await axios.get(
        `https://api.github.com/installation/repositories?per_page=${perPage}&page=${page}`,
        {
          headers: {
            'Accept': 'application/vnd.github+json',
            'Authorization': `Bearer ${token}`,
            'X-GitHub-Api-Version': '2022-11-28'
          }
        }
      );
      
      const repos = response.data.repositories.map(repo => ({
        id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        owner: repo.owner.login,
        private: repo.private,
        default_branch: repo.default_branch,
        description: repo.description,
        updated_at: repo.updated_at
      }));
      
      allRepos = allRepos.concat(repos);
      
      // Check if there are more pages
      const linkHeader = response.headers.link;
      if (!linkHeader || !linkHeader.includes('rel="next"')) {
        break;
      }
      page++;
    }
    
    res.json({ 
      repositories: allRepos,
      count: allRepos.length
    });
  } catch (error) {
    console.error('Error fetching repositories:', error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      return res.status(401).json({ 
        error: 'GitHub App installation token expired or invalid',
        code: 'TOKEN_EXPIRED'
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to fetch repositories',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get branches for a specific repository
router.get('/:owner/:repo/branches', requireInstallation, async (req, res) => {
  try {
    const { owner, repo } = req.params;
    const token = await GitHubAuth.getInstallationToken(req.installationId);
    
    const response = await axios.get(
      `https://api.github.com/repos/${owner}/${repo}/branches`,
      {
        headers: {
          'Accept': 'application/vnd.github+json',
          'Authorization': `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28'
        }
      }
    );
    
    const branches = response.data.map(branch => ({
      name: branch.name,
      protected: branch.protected,
      commit_sha: branch.commit.sha,
      commit_url: branch.commit.url
    }));
    
    res.json({ branches });
  } catch (error) {
    console.error('Error fetching branches:', error.response?.data || error.message);
    
    if (error.response?.status === 404) {
      return res.status(404).json({ 
        error: `Repository ${req.params.owner}/${req.params.repo} not found or access denied`
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to fetch branches',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get repository details
router.get('/:owner/:repo', requireInstallation, async (req, res) => {
  try {
    const { owner, repo } = req.params;
    const token = await GitHubAuth.getInstallationToken(req.installationId);
    
    const response = await axios.get(
      `https://api.github.com/repos/${owner}/${repo}`,
      {
        headers: {
          'Accept': 'application/vnd.github+json',
          'Authorization': `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28'
        }
      }
    );
    
    res.json({
      id: response.data.id,
      name: response.data.name,
      full_name: response.data.full_name,
      owner: response.data.owner.login,
      private: response.data.private,
      default_branch: response.data.default_branch,
      description: response.data.description,
      size: response.data.size,
      language: response.data.language,
      permissions: response.data.permissions
    });
  } catch (error) {
    console.error('Error fetching repository:', error);
    res.status(500).json({ error: 'Failed to fetch repository details' });
  }
});

export default router;
