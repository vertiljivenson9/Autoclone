import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import session from 'express-session';
import { createServer } from 'http';
import { setupSSE } from './src/services/uploadQueue.js';
import installRoutes from './src/routes/install.js';
import uploadRoutes from './src/routes/upload.js';
import repoRoutes from './src/routes/repos.js';

dotenv.config();

const app = express();
const server = createServer(app);

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true
}));

app.use(express.json({ limit: process.env.MAX_UPLOAD_SIZE }));
app.use(express.urlencoded({ extended: true }));

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: parseInt(process.env.SESSION_MAX_AGE) || 86400000
  }
}));

// Routes
app.use('/api/install', installRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/repos', repoRoutes);

// SSE endpoint for real-time progress
app.get('/api/upload-progress/:sessionId', setupSSE);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    githubApp: !!process.env.GITHUB_APP_ID
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  const status = err.status || 500;
  const message = process.env.NODE_ENV === 'development' 
    ? err.message 
    : 'Internal server error';
  
  res.status(status).json({ error: message });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`GitHub App: ${process.env.GITHUB_APP_NAME || 'Not configured'}`);
});

export { app, server };
