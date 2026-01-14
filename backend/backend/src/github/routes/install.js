import express from 'express';
import GitHubAuth from '../github/auth.js';

const router = express.Router();

// Start GitHub App installation
router.get('/start', (req, res) => {
  try {
    const state = Date.now().toString(36) + Math.random().toString(36).substr(2);
    req.session.installState = state;
    
    const redirectUri = `${process.env.FRONTEND_URL}/dashboard`;
    const installUrl = `https://github.com/apps/${process.env.GITHUB_APP_NAME}/installations/new?state=${state}&redirect_uri=${encodeURIComponent(redirectUri)}`;
    
    res.json({ 
      success: true, 
      installUrl,
      message: 'Redirect user to this URL to install the GitHub App'
    });
  } catch (error) {
    console.error('Install start error:', error);
    res.status(500).json({ error: 'Failed to generate installation URL' });
  }
});

// Verify installation after user returns from GitHub
router.post('/verify', async (req, res) => {
  const { installation_id, setup_action, state } = req.body;
  
  if (!installation_id) {
    return res.status(400).json({ error: 'Missing installation_id parameter' });
  }

  if (state !== req.session.installState) {
    return res.status(400).json({ error: 'Invalid state parameter' });
  }

  try {
    const installation = await GitHubAuth.verifyInstallation(installation_id);
    
    if (!installation) {
      return res.status(404).json({ error: 'Installation not found or access denied' });
    }

    // Store installation in session
    req.session.installationId = installation_id;
    req.session.installationInfo = installation;
    req.session.installState = null; // Clear one-time state

    res.json({ 
      success: true, 
      installation,
      message: `GitHub App successfully installed for ${installation.account}`
    });
  } catch (error) {
    console.error('Install verification error:', error);
    res.status(500).json({ error: 'Failed to verify installation' });
  }
});

// Get current installation info
router.get('/status', (req, res) => {
  if (!req.session.installationId) {
    return res.status(404).json({ 
      installed: false,
      message: 'GitHub App not installed'
    });
  }

  res.json({
    installed: true,
    installationId: req.session.installationId,
    installation: req.session.installationInfo
  });
});

// Uninstall endpoint (optional, for cleanup)
router.post('/uninstall', async (req, res) => {
  try {
    const { installation_id } = req.body;
    
    if (!installation_id) {
      return res.status(400).json({ error: 'Missing installation_id' });
    }

    // Note: GitHub will call webhook, but we can also clean up session
    if (req.session.installationId === installation_id) {
      req.session.installationId = null;
      req.session.installationInfo = null;
    }

    res.json({ 
      success: true, 
      message: 'Installation removed from session'
    });
  } catch (error) {
    console.error('Uninstall error:', error);
    res.status(500).json({ error: 'Failed to process uninstall' });
  }
});

export default router;
