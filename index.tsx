import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

window.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('root');
  if (!container) {
    throw new Error('Could not find root element to mount React application.');
  }
  const root = ReactDOM.createRoot(container);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});
