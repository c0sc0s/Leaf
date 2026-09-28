import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import './styles.css';
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <TooltipProvider delayDuration={450}>
      <App />
    </TooltipProvider>
  </React.StrictMode>,
);
