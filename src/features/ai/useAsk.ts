import { useCallback, useEffect, useRef, useState } from 'react';
import { answer } from '@/ai/ask';
import { askStore, type AskMessage, type AskThread } from '@/ai/askStore';
import { unitLabel, type DocumentSource, type TextAnchor } from '@/ai/document';
import type { AgentEvent } from '@/ai/runtime';
import { chat } from '@/ai/transport';
import { AiError, type AiErrorCode } from '@/ai/types';
import { reportError } from '@/lib/report';

export interface AskRun {
  threadId: string;
  text: string;
  activity: string | null;
}

export interface AskFailure {
  threadId: string;
  code: AiErrorCode | 'unknown';
  message: string;
}

function activityOf(event: Extract<AgentEvent, { type: 'tool' }>, source: DocumentSource) {
  const { from, to, query } = event.input;
  if (event.name === 'search_book') return `正在全书搜索「${String(query)}」`;
  if (event.name === 'read_pages')
    return `正在阅读${unitLabel(source.unit, Number(from))}${to !== undefined && to !== from ? ` 至 ${to}` : ''}`;
  return '正在查看目录';
}

export function useAsk(bookId: string, source: DocumentSource | null) {
  const [threads, setThreads] = useState<AskThread[]>([]);
  const [draft, setDraft] = useState<AskThread | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [run, setRun] = useState<AskRun | null>(null);
  const [failure, setFailure] = useState<AskFailure | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    let disposed = false;
    void askStore.threads(bookId).then((value) => {
      if (!disposed) setThreads(value);
    });
    return () => {
      disposed = true;
      controller.current?.abort();
    };
  }, [bookId]);

  const active = draft?.id === activeId ? draft : threads.find((thread) => thread.id === activeId);

  const start = useCallback(
    (anchor: TextAnchor) => {
      const thread = {
        ...anchor,
        id: crypto.randomUUID(),
        bookId,
        createdAt: Date.now(),
        messages: [],
      };
      setDraft(thread);
      setActiveId(thread.id);
      setFailure(null);
    },
    [bookId],
  );

  const respond = useCallback(
    async (thread: AskThread) => {
      if (!source) throw new Error('文档尚未加载');
      const turn = new AbortController();
      controller.current = turn;
      setFailure(null);
      setRun({ threadId: thread.id, text: '', activity: null });
      try {
        const result = await answer({
          source,
          anchor: thread,
          turns: thread.messages,
          chat,
          signal: turn.signal,
          onEvent: (event) =>
            setRun((current) =>
              !current
                ? current
                : event.type === 'text'
                  ? { ...current, text: current.text + event.text, activity: null }
                  : event.type === 'step'
                    ? { ...current, text: '' }
                    : { ...current, activity: activityOf(event, source) },
            ),
        });
        const reply: AskMessage = {
          role: 'assistant',
          content: result.text,
          model: result.model,
          createdAt: Date.now(),
        };
        await askStore.putMessage(thread.id, thread.messages.length, reply);
        setThreads((list) =>
          list.map((entry) =>
            entry.id === thread.id ? { ...entry, messages: [...entry.messages, reply] } : entry,
          ),
        );
      } catch (error) {
        if (turn.signal.aborted) return;
        reportError('AI 问答失败', error);
        setFailure({
          threadId: thread.id,
          code: error instanceof AiError ? error.code : 'unknown',
          message: error instanceof Error ? error.message : String(error),
        });
      } finally {
        if (controller.current === turn) {
          controller.current = null;
          setRun(null);
        }
      }
    },
    [source],
  );

  const ask = useCallback(
    async (question: string) => {
      if (!active || controller.current || !question.trim()) return;
      const message: AskMessage = { role: 'user', content: question.trim(), createdAt: Date.now() };
      try {
        if (active === draft) await askStore.putThread(active);
        await askStore.putMessage(active.id, active.messages.length, message);
      } catch (error) {
        setFailure({
          threadId: active.id,
          code: 'unknown',
          message: `问题没有保存：${error instanceof Error ? error.message : String(error)}`,
        });
        return;
      }
      if (active === draft) setDraft(null);
      const updated = { ...active, messages: [...active.messages, message] };
      setThreads((list) => [updated, ...list.filter((entry) => entry.id !== active.id)]);
      await respond(updated);
    },
    [active, draft, respond],
  );

  const retry = useCallback(() => {
    if (active?.messages.at(-1)?.role === 'user' && !controller.current) void respond(active);
  }, [active, respond]);

  const stop = useCallback(() => controller.current?.abort(), []);

  const remove = useCallback(
    async (id: string) => {
      if (run?.threadId === id) controller.current?.abort();
      await askStore.deleteThread(id);
      setThreads((list) => list.filter((entry) => entry.id !== id));
      setActiveId((current) => (current === id ? null : current));
    },
    [run],
  );

  return {
    threads,
    active: active ?? null,
    run,
    failure: failure && failure.threadId === active?.id ? failure : null,
    ready: source !== null,
    start,
    select: setActiveId,
    ask,
    retry,
    stop,
    remove,
  };
}
