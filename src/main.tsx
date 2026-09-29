import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { TooltipProvider } from './components/ui/tooltip';
import { LazyMotion, MotionConfig, domMax } from 'motion/react';
import { transition } from './lib/motion';
import { applyGlassAppearance, readSettings } from './lib/appearance';
import './theme.css';
import './styles/base.css';
import './styles/overlays.css';
import './styles/library.css';
import './styles/reader.css';
import './styles/notes.css';
applyGlassAppearance(readSettings());
document.documentElement.dataset.platform = window.desktop?.platform ?? 'web';
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <LazyMotion features={domMax} strict>
        <MotionConfig reducedMotion="user" transition={transition}>
          <TooltipProvider delayDuration={450}>
            <App />
          </TooltipProvider>
        </MotionConfig>
      </LazyMotion>
    </ErrorBoundary>
  </React.StrictMode>,
);
