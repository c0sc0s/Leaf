import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { TooltipProvider } from './components/ui/tooltip';
import { LazyMotion, MotionConfig, domMax } from 'motion/react';
import { transition } from './lib/motion';
import './theme.css';
import './styles/base.css';
import './styles/overlays.css';
import './styles/library.css';
import './styles/reader.css';
import './styles/notes.css';
document.documentElement.classList.toggle('vibrant', window.desktop?.platform === 'darwin');
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LazyMotion features={domMax} strict>
      <MotionConfig reducedMotion="user" transition={transition}>
        <TooltipProvider delayDuration={450}>
          <App />
        </TooltipProvider>
      </MotionConfig>
    </LazyMotion>
  </React.StrictMode>,
);
