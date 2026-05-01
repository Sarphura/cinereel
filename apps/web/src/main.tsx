import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

document.documentElement.classList.add('dark');
document.documentElement.setAttribute('data-theme', 'dark');

ReactDOM.createRoot(document.getElementById('app')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
