import { Button } from '@/components/ui/button';
import { createContext, memo, useContext, useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { revealIn } from '../../../lib/reveal';
import { isCancelledRender, reportError } from '../../../lib/report';

const THUMBNAIL_WIDTH = 140;
type Watch = (element: Element, onChange: (visible: boolean) => void) => () => void;
const VisibilityContext = createContext<Watch | null>(null);

// One observer for the whole list; a long document would otherwise create one per page.
function useVisibilityWatcher(root: HTMLElement | null): Watch | null {
  const [watch, setWatch] = useState<Watch | null>(null);
  useEffect(() => {
    if (!root) return;
    const callbacks = new Map<Element, (visible: boolean) => void>();
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => callbacks.get(e.target)?.(e.isIntersecting)),
      { root, rootMargin: '400px 0px' },
    );
    setWatch(() => (element: Element, onChange: (visible: boolean) => void) => {
      callbacks.set(element, onChange);
      observer.observe(element);
      return () => {
        callbacks.delete(element);
        observer.unobserve(element);
      };
    });
    return () => observer.disconnect();
  }, [root]);
  return watch;
}

export function ThumbnailList({
  pdf,
  page,
  revealKey,
  onSelect,
}: {
  pdf: PDFDocumentProxy;
  page: number;
  revealKey: number;
  onSelect: (page: number) => void;
}) {
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const watch = useVisibilityWatcher(root);
  return (
    <div className="sidebar-scroll thumbnails" ref={setRoot}>
      <VisibilityContext.Provider value={watch}>
        {/* Mounting before the observer exists would start every page rendering at once. */}
        {watch &&
          Array.from({ length: pdf.numPages }, (_, i) => (
            <Thumbnail
              key={i + 1}
              pdf={pdf}
              number={i + 1}
              active={i + 1 === page}
              revealKey={i + 1 === page ? revealKey : undefined}
              onSelect={onSelect}
            />
          ))}
      </VisibilityContext.Provider>
    </div>
  );
}

const Thumbnail = memo(function Thumbnail({
  pdf,
  number,
  active,
  revealKey,
  onSelect,
}: {
  pdf: PDFDocumentProxy;
  number: number;
  active: boolean;
  revealKey?: number;
  onSelect: (page: number) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const root = useRef<HTMLButtonElement>(null);
  const watch = useContext(VisibilityContext);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!active) return;
    const scroller = root.current!.closest<HTMLElement>('.sidebar-scroll');
    if (!scroller) throw new Error('Thumbnail rendered outside its scroll container');
    revealIn(scroller, root.current!);
  }, [revealKey]);
  useEffect(() => {
    if (!watch) throw new Error('Thumbnail rendered outside ThumbnailList');
    return watch(root.current!, setVisible);
  }, [watch]);
  useEffect(() => {
    const target = canvas.current;
    if (!visible || !target) return;
    let canceled = false;
    let task: RenderTask | undefined;
    void pdf
      .getPage(number)
      .then((p) => {
        if (canceled) return;
        const viewport = p.getViewport({
          scale: THUMBNAIL_WIDTH / p.getViewport({ scale: 1 }).width,
        });
        target.width = Math.ceil(viewport.width);
        target.height = Math.ceil(viewport.height);
        // Keep the box when the bitmap is released so the list does not jump.
        target.style.height = `${viewport.height}px`;
        task = p.render({ canvas: target, viewport });
        return task.promise;
      })
      .catch((error) => {
        if (!isCancelledRender(error)) reportError(`第 ${number} 页缩略图渲染失败`, error);
      });
    return () => {
      canceled = true;
      task?.cancel();
      target.width = 0;
      target.height = 0;
    };
  }, [pdf, number, visible]);
  return (
    <Button
      variant="ghost"
      ref={root}
      className={`thumbnail ${active ? 'selected' : ''}`}
      aria-current={active ? 'page' : undefined}
      onClick={() => onSelect(number)}
    >
      <canvas ref={canvas} />
      <span>{number}</span>
    </Button>
  );
});
