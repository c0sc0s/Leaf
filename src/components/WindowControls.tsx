import { useEffect, useState } from 'react';
import type { WindowState } from '@/types';

export function WindowControls() {
  const desktop = window.desktop;
  const [state, setState] = useState<WindowState>({ maximized: false, fullscreen: false });

  useEffect(() => {
    if (desktop?.platform !== 'win32') return;
    let active = true;
    const stop = desktop.onWindowState(setState);
    void desktop
      .getWindowState()
      .then((next) => {
        if (active) setState(next);
      })
      .catch(() => {});
    return () => {
      active = false;
      stop();
    };
  }, [desktop]);

  if (desktop?.platform !== 'win32') return null;
  const restore = state.maximized || state.fullscreen;
  return (
    <div className="window-controls" role="group" aria-label="窗口控件">
      <button type="button" aria-label="最小化窗口" title="最小化" onClick={desktop.minimizeWindow}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M1 6h10" stroke="currentColor" />
        </svg>
      </button>
      <button
        type="button"
        aria-label={restore ? '还原窗口' : '最大化窗口'}
        title={restore ? '还原' : '最大化'}
        onClick={desktop.toggleMaximizeWindow}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          {restore ? (
            <path d="M3.5 3.5v-2h7v7h-2m-7-5h7v7h-7z" stroke="currentColor" />
          ) : (
            <rect x="1.5" y="1.5" width="9" height="9" stroke="currentColor" />
          )}
        </svg>
      </button>
      <button
        type="button"
        className="window-close"
        aria-label="关闭窗口"
        title="关闭"
        onClick={desktop.closeWindow}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="m1.5 1.5 9 9m0-9-9 9" stroke="currentColor" />
        </svg>
      </button>
    </div>
  );
}
