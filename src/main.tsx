import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { networkAuditor } from './utils/networkAuditor.ts';

// Start monitoring outgoing network calls immediately
networkAuditor.init();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);