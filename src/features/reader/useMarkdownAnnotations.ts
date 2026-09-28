import { useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { Annotation, MarkColor, MarkKind } from '@/types';
import type { DocumentSelection } from '@/lib/selection';
import { storage } from '@/lib/db';
import { colors } from '@/lib/export';
import { useAnnotations } from '@/lib/useAnnotations';
import { captureMarkdownSelection } from './markdownAnnotations';

export function useMarkdownAnnotations(
  bookId: string,
  page: number,
  article: RefObject<HTMLElement | null>,
  notify: (message: string) => void,
) {
  const annotations = useAnnotations(notify);
  const [selection, setSelection] = useState<DocumentSelection | null>(null);
  const [active, setActive] = useState<{ id: string; x: number; y: number } | null>(null);
  const [right, setRight] = useState(false);
  const [color, setColor] = useState<MarkColor>(() => {
    const value = localStorage.getItem('folio-mark-color');
    return value && value in colors ? (value as MarkColor) : 'amber';
  });
  const dragging = useRef(false);
  const pageMarks = useMemo(
    () => annotations.marks.filter((mark) => mark.page === page),
    [annotations.marks, page],
  );
  useEffect(() => {
    localStorage.setItem('folio-mark-color', color);
  }, [color]);
  useEffect(() => {
    let disposed = false;
    void storage
      .annotations(bookId)
      .then((marks) => {
        if (!disposed) annotations.load(marks);
      })
      .catch(() => notify('批注加载失败，请重试'));
    return () => {
      disposed = true;
    };
  }, [bookId, annotations.load, notify]);
  useEffect(() => {
    setSelection(null);
    setActive(null);
  }, [page]);
  useEffect(() => {
    let frame = 0;
    const capture = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!dragging.current && article.current)
          setSelection(captureMarkdownSelection(article.current, page));
      });
    };
    const down = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      dragging.current = !!article.current?.contains(target);
      if (!target.closest('.annotation-popover,.notes-panel')) setActive(null);
    };
    const up = () => {
      dragging.current = false;
      capture();
    };
    document.addEventListener('pointerdown', down);
    document.addEventListener('pointerup', up);
    document.addEventListener('mouseup', up);
    document.addEventListener('selectionchange', capture);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('mouseup', up);
      document.removeEventListener('selectionchange', capture);
    };
  }, [article, page]);
  const focusNote = (id: string) => {
    setActive(null);
    setRight(true);
    requestAnimationFrame(() =>
      document.querySelector<HTMLTextAreaElement>(`[data-note-id="${id}"]`)?.focus(),
    );
  };
  async function annotate(kind: MarkKind, note = false) {
    if (!selection) return;
    const mark: Annotation = {
      id: crypto.randomUUID(),
      bookId,
      page,
      start: selection.start,
      end: selection.end,
      quote: selection.quote,
      rects: [],
      kind,
      color,
      note: '',
      createdAt: Date.now(),
      source: 'text',
    };
    setSelection(null);
    window.getSelection()?.removeAllRanges();
    await annotations.add([mark]);
    if (note) focusNote(mark.id);
  }
  const openMark = (target: HTMLElement) => {
    if (!window.getSelection()?.isCollapsed) return;
    const mark = target.closest<HTMLElement>('[data-mark-id]');
    if (!mark) return;
    const box = mark.getBoundingClientRect();
    setActive({
      id: mark.dataset.markId!,
      x: Math.max(16, Math.min(window.innerWidth - 340, box.left)),
      y: Math.max(56, box.top - 54),
    });
  };
  const dismiss = () => {
    setSelection(null);
    setActive(null);
  };
  return {
    annotations,
    selection,
    active,
    setActive,
    color,
    setColor,
    right,
    setRight,
    pageMarks,
    annotate,
    focusNote,
    openMark,
    dismiss,
    remove: async (mark: Annotation) => {
      setActive(null);
      await annotations.remove(mark);
    },
  };
}
