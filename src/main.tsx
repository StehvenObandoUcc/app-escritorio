import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { applyStoredTheme } from '@/lib/theme';
import '@/ui/tokens/index.css';

// El tema elegido se aplica antes de la primera pintura (sin parpadeo, AC-46).
applyStoredTheme();

const root = document.getElementById('root');
if (!root) throw new Error('Falta el elemento #root en index.html');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
