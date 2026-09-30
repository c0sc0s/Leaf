import React from 'react';
import { createRoot } from 'react-dom/client';
import { LazyMotion, MotionConfig, domMax } from 'motion/react';
import { TooltipProvider } from '@leaf/ui/primitives/tooltip';
import { transition } from '@leaf/ui/motion';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { compose } from './compose';

export async function start() {
  const services = await compose();
  window.desktop?.storage.onBeforeClose(services.flush);
  document.documentElement.dataset.platform = window.desktop?.platform ?? 'web';
  createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ErrorBoundary>
        <LazyMotion features={domMax} strict>
          <MotionConfig reducedMotion="user" transition={transition}>
            <TooltipProvider delayDuration={450}>
              <App services={services} />
            </TooltipProvider>
          </MotionConfig>
        </LazyMotion>
      </ErrorBoundary>
    </React.StrictMode>,
  );
}
