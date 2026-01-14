import jwt from 'jsonwebtoken';
import axios from 'axios';

class GitHubAuth {
  constructor() {
    this.appId = process.env.GITHUB_APP_ID;
    this.privateKey = process.env.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, '\n');
    this.tokenCache = new Map();
  }

  generateJWT() {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iat: now - 60,
      exp: now + (10 * 60),
      iss: this.appId
    };
    return jwt.sign(payload, this.privateKey, { algorithm: 'RS256' });
  }

  async getInstallationToken(installationId) {
    const cacheKey = `installation_token_${installationId}`;
    
    if (this.tokenCache.has(cacheKey)) {
      const cached = this.tokenCache.get(cacheKey);
      if (Date.now() < cached.expiresAt) {
        return cached.token;
      }
      this.tokenCache.delete(cacheKey);
    }

    const jwtToken = this.generateJWT();
    
    try {
      const response = await axios.post(
        `https://api.github.com/app/installations/${installationId}/access_tokens`,
        {},
        {
          headers: {
            'Accept': 'application/vnd.github+json',
            'Authorization': `Bearer ${jwtToken}`,
            'X-GitHub-Api-Version': '2022-11-28'
          }
        }
      );

      const tokenData = response.data;
      const expiresAt = Date.now() + (60 * 60 * 1000) - 60000;

      this.tokenCache.set(cacheKey, {
        token: tokenData.token,
        expiresAt: expiresAt
      });

      return tokenData.token;
    } catch (error) {
      console.error('Failed to get installation token:', error.response?.data || error.message);
      throw new Error(`GitHub App authentication failed: ${error.message}`);
    }
  }

  async verifyInstallation(installationId) {
    const jwtToken = this.generateJWT();
    
    try {
      const response = await axios.get(
        `https://api.github.com/app/installations/${installationId}`,
        {
          headers: {
            'Accept': 'application/vnd.github+json',
            'Authorization': `Bearer ${jwtToken}`,
            'X-GitHub-Api-Version': '2022-11-28'
          }
        }
      );
      
      return {
        id: response.data.id,
        account: response.data.account.login,
        accountType: response.data.account.type,
        repositoriesUrl: response.data.repositories_url,
        createdAt: response.data.created_at
      };
    } catch (error) {
      if (error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async getUserInstallations() {
    const jwtToken = this.generateJWT();
    
    try {
      const response = await axios.get(
        'https://api.github.com/app/installations',
        {
          headers: {
            'Accept': 'application/vnd.github+json',
            'Authorization': `Bearer ${jwtToken}`,
            'X-GitHub-Api-Version': '2022-11-28'
          }
        }
      );
      
      return response.data;
    } catch (error) {
      console.error('Failed to get app installations:', error);
      throw error;
    }
  }
}

export default new GitHubAuth();
