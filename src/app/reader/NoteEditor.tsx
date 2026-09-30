import { Textarea } from '@leaf/ui/primitives/textarea';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Annotation } from '@leaf/contracts/annotations';
import type { PersistenceCoordinator } from '../../platform/transport/persistence';

export function NoteEditor({
  mark,
  label,
  save,
  persistence,
  notify,
}: {
  mark: Annotation;
  label: string;
  save(id: string, text: string): Promise<void>;
  persistence: PersistenceCoordinator;
  notify(message: string): void;
}) {
  const [draft, setDraft] = useState(mark.note),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    latest = useRef(mark.note),
    dirty = useRef(false),
    saving = useRef(save);
  saving.current = save;
  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    if (!dirty.current) return;
    const value = latest.current;
    dirty.current = false;
    try {
      await saving.current(mark.id, value);
    } catch (error) {
      dirty.current = true;
      throw error;
    }
  }, [mark.id]);
  const attempt = useCallback(() => {
    void flush().catch((error) =>
      notify('笔记未保存：' + (error instanceof Error ? error.message : String(error))),
    );
  }, [flush, notify]);
  useEffect(() => {
    if (!dirty.current) {
      latest.current = mark.note;
      setDraft(mark.note);
    }
  }, [mark.note]);
  useEffect(() => {
    const unregister = persistence.register(flush);
    return () => {
      unregister();
      attempt();
    };
  }, [mark.id, persistence, flush, attempt]);
  return (
    <Textarea
      aria-label={`${label}批注笔记`}
      data-note-id={mark.id}
      value={draft}
      placeholder="写下笔记，自动保存…"
      onChange={(event) => {
        latest.current = event.target.value;
        dirty.current = true;
        setDraft(event.target.value);
        clearTimeout(timer.current);
        timer.current = setTimeout(attempt, 250);
      }}
      onBlur={attempt}
    />
  );
}
