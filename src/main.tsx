import { loadPreferences } from './lib/preferences';
import { migrateLegacyStorage } from './lib/legacyMigration';
import { flushStorage } from './lib/storageClient';
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
import './styles/materials.css';
async function start() {
  const initialize = async () => {
    const notice = await migrateLegacyStorage();
    await loadPreferences();
    return notice;
  };
  const startupNotice = navigator.locks
    ? await navigator.locks.request('leaf-storage-bootstrap', initialize)
    : await initialize();
  window.desktop?.storage?.onBeforeClose(flushStorage);
  applyGlassAppearance(readSettings());
  document.documentElement.dataset.platform = window.desktop?.platform ?? 'web';
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ErrorBoundary>
        <LazyMotion features={domMax} strict>
          <MotionConfig reducedMotion="user" transition={transition}>
            <TooltipProvider delayDuration={450}>
              <App startupNotice={startupNotice} />
            </TooltipProvider>
          </MotionConfig>
        </LazyMotion>
      </ErrorBoundary>
    </React.StrictMode>,
  );
}
void start().catch((error: unknown) => {
  const root = document.getElementById('root')!;
  root.style.cssText = 'padding:48px;max-width:720px;margin:auto';
  const heading = document.createElement('h1');
  heading.textContent = '无法打开书库';
  const detail = document.createElement('p');
  detail.textContent = error instanceof Error ? error.message : String(error);
  const retry = document.createElement('button');
  retry.textContent = '重试';
  retry.onclick = () => location.reload();
  root.replaceChildren(heading, detail, retry);
  window.desktop?.ready();
});
