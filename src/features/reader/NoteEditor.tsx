import { registerStorageFlusher } from '../../lib/storageClient';
import { Textarea } from '@/components/ui/textarea';
import { useEffect, useRef, useState } from 'react';
import type { Annotation } from '../../types';
export function NoteEditor({
  mark,
  save,
  unit = '页',
}: {
  mark: Annotation;
  save: (id: string, text: string) => Promise<void>;
  unit?: '页' | '章';
}) {
  const [draft, setDraft] = useState(mark.note);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef(mark.note);
  const saving = useRef(save);
  saving.current = save;
  const dirty = useRef(false);
  const flush = () => {
    clearTimeout(timer.current);
    if (dirty.current) {
      dirty.current = false;
      return saving.current(mark.id, latest.current);
    }
  };
  useEffect(() => {
    if (!dirty.current) {
      latest.current = mark.note;
      setDraft(mark.note);
    }
  }, [mark.note]);
  useEffect(() => {
    const unregister = registerStorageFlusher(flush);
    window.addEventListener('pagehide', flush);
    return () => {
      unregister();
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [mark.id]);
  return (
    <Textarea
      aria-label={`第 ${mark.page} ${unit}批注笔记`}
      data-note-id={mark.id}
      value={draft}
      placeholder="写下笔记，自动保存…"
      onChange={(event) => {
        const value = event.target.value;
        latest.current = value;
        dirty.current = true;
        setDraft(value);
        clearTimeout(timer.current);
        timer.current = setTimeout(flush, 250);
      }}
      onBlur={flush}
    />
  );
}
