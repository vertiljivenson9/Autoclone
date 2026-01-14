import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles/main.css';

// Check for installation_id in URL (callback from GitHub)
const urlParams = new URLSearchParams(window.location.search);
const installationId = urlParams.get('installation_id');
const setupAction = urlParams.get('setup_action');

if (installationId && setupAction === 'install') {
  // Send installation ID to backend
  fetch(`${process.env.REACT_APP_API_URL}/api/install/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ 
      installation_id: installationId,
      setup_action: setupAction,
      state: urlParams.get('state')
    })
  }).then(response => response.json())
    .then(data => {
      // Remove installation parameters from URL
      window.history.replaceState({}, '', '/');
    })
    .catch(error => {
      console.error('Failed to verify installation:', error);
    });
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
