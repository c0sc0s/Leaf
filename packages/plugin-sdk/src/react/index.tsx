import { useSyncExternalStore, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { LazyMotion, MotionConfig, domMax } from 'motion/react';
import { TooltipProvider } from '@leaf/ui/primitives/tooltip';
import type { Store } from '@leaf/shared/events';
import type { Disposable } from '@leaf/shared/lifecycle';

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

export function mountReact(
  container: HTMLElement,
  element: ReactNode,
  options: { onError?(error: unknown): void } = {},
): Disposable {
  const mount = document.createElement('div');
  mount.style.display = 'contents';
  container.append(mount);
  const root = createRoot(
    mount,
    options.onError ? { onUncaughtError: options.onError } : undefined,
  );
  let closed = false;
  root.render(
    <LazyMotion features={domMax} strict>
      <MotionConfig reducedMotion="user">
        <TooltipProvider delayDuration={450}>{element}</TooltipProvider>
      </MotionConfig>
    </LazyMotion>,
  );
  return {
    dispose: () => {
      if (closed) return;
      closed = true;
      mount.remove();
      queueMicrotask(() => root.unmount());
    },
  };
}

export { Button } from '@leaf/ui/primitives/button';
export { Input } from '@leaf/ui/primitives/input';
export { Textarea } from '@leaf/ui/primitives/textarea';
export { TooltipProvider } from '@leaf/ui/primitives/tooltip';
export { IconButton, Spinner, Exiting } from '@leaf/ui/primitives/composition';
export * as Icons from '@leaf/ui/icons';
