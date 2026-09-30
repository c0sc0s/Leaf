import { useEffect, useRef } from 'react';
import type { Disposable } from '@leaf/shared/lifecycle';

export function ExtensionSlot({
  mount,
  className,
}: {
  mount(container: HTMLElement): Disposable;
  className?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const mounted = mount(container.current!);
    return () => {
      void mounted.dispose();
    };
  }, [mount]);
  return <div ref={container} className={className} />;
}
