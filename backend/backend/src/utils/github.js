const GITHUB_CONFIG = {
  // API endpoints
  API_BASE: 'https://api.github.com',
  API_VERSION: '2022-11-28',
  
  // Rate limiting
  RATE_LIMIT_WARNING_THRESHOLD: 10,
  RATE_LIMIT_RESET_BUFFER: 1000, // milliseconds
  
  // Upload settings
  MAX_FILE_SIZE: 100 * 1024 * 1024, // 100MB
  MAX_FILES_PER_UPLOAD: 1000,
  UPLOAD_CONCURRENCY: 3,
  
  // Timeouts
  REQUEST_TIMEOUT: 30000, // 30 seconds
  UPLOAD_TIMEOUT: 300000, // 5 minutes
  
  // Retry configuration
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000,
  RETRY_BACKOFF_FACTOR: 2,
  
  // GitHub App settings
  APP_PERMISSIONS: {
    contents: 'write',
    metadata: 'read'
  },
  
  // Events (for webhooks)
  APP_EVENTS: [
    'installation',
    'installation_repositories'
  ],
  
  // File upload defaults
  DEFAULT_COMMIT_MESSAGE: 'Upload files via GitHub Folder Uploader',
  DEFAULT_BRANCH: 'main',
  
  // Validation
  ALLOWED_FILE_TYPES: [
    // Text files
    '.txt', '.md', '.json', '.yml', '.yaml', '.xml', '.csv',
    // Code files
    '.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.cpp', '.c', '.h',
    '.html', '.css', '.scss', '.sass', '.less',
    '.php', '.rb', '.go', '.rs', '.swift', '.kt', '.dart',
    // Configuration
    '.env', '.gitignore', '.dockerignore', '.editorconfig',
    // Documents
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    // Images
    '.jpg', '.jpeg', '.png', '.gif', '.svg', '.bmp', '.webp',
    // Archives (only for extraction)
    '.zip'
  ],
  
  // Blocked file patterns (regex)
  BLOCKED_PATTERNS: [
    /\.(exe|dll|so|dylib|bat|cmd|sh|bin)$/i,
    /^\.git(\/|$)/i,
    /\/\.git(\/|$)/i,
    /^(node_modules|\.env|\.idea|\.vscode)(\/|$)/i,
    /package-lock\.json$/i,
    /yarn\.lock$/i
  ]
};

export default GITHUB_CONFIG;

export function validateGitHubConfig() {
  const requiredEnvVars = [
    'GITHUB_APP_ID',
    'GITHUB_APP_PRIVATE_KEY',
    'GITHUB_APP_NAME'
  ];
  
  const missing = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  
  return true;
}

export function getGitHubHeaders(token) {
  return {
    'Accept': 'application/vnd.github+json',
    'Authorization': `Bearer ${token}`,
    'X-GitHub-Api-Version': GITHUB_CONFIG.API_VERSION,
    'User-Agent': 'GitHub-Folder-Uploader/2.0'
  };
}

export function formatGitHubError(error) {
  if (!error.response) {
    return {
      message: error.message || 'Unknown GitHub API error',
      status: 500
    };
  }
  
  const { status, data } = error.response;
  let message = `GitHub API error: ${status}`;
  
  if (data && data.message) {
    message = data.message;
    
    if (data.errors && Array.isArray(data.errors)) {
      message += ` (${data.errors.map(e => e.message).join(', ')})`;
    }
  }
  
  return {
    message,
    status,
    details: data
  };
}
