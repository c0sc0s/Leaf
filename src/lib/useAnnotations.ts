import { useEffect, useMemo, useRef, useState } from 'react';
import type { Annotation } from '../types';
import { storage } from './db';
import { reportError } from './report';
interface Edit {
  before: Annotation[];
  after: Annotation[];
  group?: string;
  time: number;
}
export function useAnnotations(notify: (message: string) => void) {
  const [marks, setMarks] = useState<Annotation[]>([]);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [history, setHistory] = useState({ undo: false, redo: false });
  useEffect(() => {
    if (status !== 'saved') return;
    const timer = setTimeout(() => setStatus('idle'), 2000);
    return () => clearTimeout(timer);
  }, [status]);
  const current = useRef(marks);
  const undoStack = useRef<Edit[]>([]);
  const redoStack = useRef<Edit[]>([]);
  const queue = useRef(Promise.resolve());
  const notifier = useRef(notify);
  notifier.current = notify;
  // Actions only touch refs and setters, so they stay identical across renders.
  const actions = useMemo(() => {
    const sync = () =>
      setHistory({ undo: !!undoStack.current.length, redo: !!redoStack.current.length });
    const apply = async (before: Annotation[], after: Annotation[]) => {
      await storage.replaceAnnotations(
        before.map((m) => m.id),
        after,
      );
      const removed = new Set([...before, ...after].map((m) => m.id));
      current.current = [...current.current.filter((m) => !removed.has(m.id)), ...after];
      setMarks(current.current);
    };
    const run = (operation: () => Promise<void>) => {
      const next = queue.current.then(async () => {
        setStatus('saving');
        await operation();
        setStatus('saved');
      });
      queue.current = next.catch((error) => {
        reportError('批注保存失败', error);
        setStatus('error');
        notifier.current('批注未保存成功，请检查存储空间后重试。');
      });
      return queue.current;
    };
    const edit = (resolve: () => Omit<Edit, 'time'>) =>
      run(async () => {
        const entry = { ...resolve(), time: Date.now() };
        if (JSON.stringify(entry.before) === JSON.stringify(entry.after)) return;
        await apply(entry.before, entry.after);
        const previous = undoStack.current.at(-1);
        if (entry.group && previous?.group === entry.group && entry.time - previous.time < 2500) {
          previous.after = entry.after;
          previous.time = entry.time;
        } else undoStack.current.push(entry);
        if (undoStack.current.length > 100) undoStack.current.shift();
        redoStack.current = [];
        sync();
      });
    const find = (id: string) => current.current.find((m) => m.id === id);
    return {
      load: (value: Annotation[]) => {
        current.current = value;
        setMarks(value);
      },
      flush: async () => {
        await queue.current;
        return current.current;
      },
      add: (after: Annotation[]) => edit(() => ({ before: [], after })),
      remove: (mark: Annotation) =>
        edit(() => ({ before: current.current.filter((m) => m.id === mark.id), after: [] })),
      style: (id: string, changes: Pick<Partial<Annotation>, 'color' | 'kind'>) =>
        edit(() => {
          const mark = find(id);
          return { before: mark ? [mark] : [], after: mark ? [{ ...mark, ...changes }] : [] };
        }),
      note: (id: string, text: string) =>
        edit(() => {
          const mark = find(id);
          return {
            before: mark ? [mark] : [],
            after: mark ? [{ ...mark, note: text }] : [],
            group: `note:${id}`,
          };
        }),
      undo: () =>
        run(async () => {
          const entry = undoStack.current.at(-1);
          if (!entry) return;
          await apply(entry.after, entry.before);
          undoStack.current.pop();
          redoStack.current.push(entry);
          sync();
        }),
      redo: () =>
        run(async () => {
          const entry = redoStack.current.at(-1);
          if (!entry) return;
          await apply(entry.before, entry.after);
          redoStack.current.pop();
          undoStack.current.push(entry);
          sync();
        }),
    };
  }, []);
  return { marks, status, history, ...actions };
}
