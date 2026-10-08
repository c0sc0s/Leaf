import type { PluginHostAPI } from '@leaf/contracts/host';
import type { Locator } from '@leaf/contracts/documents';
import type { ReadableSession, TextSelection } from '@leaf/contracts/reader';
import { Store } from '@leaf/shared/events';
import { SerialQueue } from '@leaf/shared/async';
import { isJsonValue, type JsonValue } from '@leaf/shared/types';
import { runAgent } from '../../agent/runtime';
import { AiError, type Usage } from '../../agent/types';
import type { ModelClient } from '../../models/client';
import { ReferenceCatalog, documentTools, type Citation } from '../../document-tools';
import { askContext, askMessages } from './context';

export interface AskMessage {
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  model?: string;
  usage?: Usage | null;
  runId?: string;
}
export interface AskThread {
  id: string;
  locator: Locator;
  quote: string;
  createdAt: number;
  messages: AskMessage[];
  references: Citation[];
}
export interface AskRun {
  threadId: string;
  runId: string;
  text: string;
  activity: string;
  references: Citation[];
}
export interface AskFailure {
  threadId: string;
  code: string;
  message: string;
}
export interface AskState {
  threads: AskThread[];
  activeId: string | null;
  ready: boolean;
  run: AskRun | null;
  failure: AskFailure | null;
}

function decodeThread(value: JsonValue, session: ReadableSession): AskThread | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const thread = value as unknown as AskThread;
  if (
    typeof thread.id !== 'string' ||
    typeof thread.quote !== 'string' ||
    !Number.isFinite(thread.createdAt) ||
    !session.document.locators.validate(thread.locator) ||
    !Array.isArray(thread.messages) ||
    !Array.isArray(thread.references)
  )
    return null;
  if (
    thread.messages.some(
      (message) =>
        !message ||
        !['user', 'assistant'].includes(message.role) ||
        typeof message.content !== 'string' ||
        !Number.isFinite(message.createdAt),
    )
  )
    return null;
  if (
    thread.references.some(
      (reference) =>
        !reference ||
        typeof reference.id !== 'string' ||
        !/^\d+$/.test(reference.id) ||
        typeof reference.label !== 'string' ||
        !session.document.locators.validate(reference.locator),
    )
  )
    return null;
  return thread;
}

export class AskService {
  readonly state = new Store<AskState>({
    threads: [],
    activeId: null,
    ready: false,
    run: null,
    failure: null,
  });
  private writes = new SerialQueue();
  private controller?: AbortController;
  private pending?: Promise<void>;
  private loaded: Promise<void>;
  private stopped = false;
  private closing?: Promise<void>;
  private abort = () => {
    void this.dispose();
  };
  constructor(
    readonly session: ReadableSession,
    private host: PluginHostAPI,
    readonly models: ModelClient,
  ) {
    this.loaded = this.load();
    session.signal.addEventListener('abort', this.abort, { once: true });
    if (session.signal.aborted) this.abort();
  }
  private async load() {
    try {
      const saved = await this.host.storage.list('ask.thread.', this.session.document.metadata.id);
      if (this.stopped) return;
      const threads = saved
        .map(({ value }) => decodeThread(value, this.session))
        .filter((thread): thread is AskThread => !!thread)
        .sort((a, b) => b.createdAt - a.createdAt);
      this.state.update((state) => ({ ...state, threads, ready: true }));
    } catch (error) {
      if (!this.stopped) {
        this.state.update((state) => ({ ...state, ready: true }));
        this.host.notify(`读取问答失败：${String(error)}`);
      }
    }
  }
  async begin(selection: TextSelection | null) {
    await this.loaded;
    if (this.stopped) return;
    if (this.state.get().run) {
      this.select(this.state.get().run!.threadId);
      return;
    }
    const locator =
      selection?.anchors[0] ??
      this.session.snapshot().position?.locator ??
      this.session.document.navigation?.locator(0);
    if (!locator || !this.session.document.locators.validate(locator))
      throw new Error('文档尚未准备好');
    const thread: AskThread = {
      id: crypto.randomUUID(),
      locator,
      quote: selection?.quote ?? this.session.document.locators.label(locator),
      createdAt: Date.now(),
      messages: [],
      references: [],
    };
    this.state.update((state) => ({
      ...state,
      activeId: thread.id,
      threads: [thread, ...state.threads],
      failure: null,
    }));
  }
  select(id: string | null) {
    this.state.update((state) => ({
      ...state,
      activeId: id,
      failure: state.failure?.threadId === id ? state.failure : null,
    }));
  }
  private async save(thread: AskThread) {
    const value = JSON.parse(JSON.stringify(thread)) as JsonValue;
    if (!isJsonValue(value)) throw new Error('问答内容无法保存');
    await this.writes.enqueue(() =>
      this.host.storage.set(`ask.thread.${thread.id}`, value, this.session.document.metadata.id),
    );
  }
  async remove(id: string) {
    if (this.state.get().run?.threadId === id) {
      this.stop();
      await this.pending;
    }
    await this.writes.enqueue(() =>
      this.host.storage.delete(`ask.thread.${id}`, this.session.document.metadata.id),
    );
    this.state.update((state) => ({
      ...state,
      threads: state.threads.filter((thread) => thread.id !== id),
      activeId: state.activeId === id ? null : state.activeId,
    }));
  }
  ask(question?: string) {
    if (this.stopped || this.state.get().run) return Promise.resolve();
    let thread = this.state.get().threads.find((entry) => entry.id === this.state.get().activeId);
    if (!thread) return Promise.resolve();
    if (question?.trim())
      thread = {
        ...thread,
        messages: [
          ...thread.messages,
          { role: 'user', content: question.trim(), createdAt: Date.now() },
        ],
      };
    if (thread.messages.at(-1)?.role !== 'user') return Promise.resolve();
    const runId = crypto.randomUUID(),
      controller = new AbortController();
    this.controller = controller;
    this.state.update((state) => ({
      ...state,
      threads: state.threads.map((entry) => (entry.id === thread!.id ? thread! : entry)),
      failure: null,
      run: {
        threadId: thread!.id,
        runId,
        text: '',
        activity: '正在阅读原文…',
        references: thread!.references,
      },
    }));
    const pending = this.execute(thread, runId, controller.signal);
    this.pending = pending;
    void pending
      .finally(() => {
        if (this.pending === pending) this.pending = undefined;
      })
      .catch(() => {});
    return pending;
  }
  private async execute(thread: AskThread, runId: string, signal: AbortSignal) {
    let completed: AskThread | undefined;
    const events: Promise<void>[] = [],
      report = (event: Parameters<PluginHostAPI['tasks']['report']>[0]) => {
        const write = this.host.tasks.report(event);
        events.push(write);
        void write.catch(() => {});
      };
    const catalog = new ReferenceCatalog(this.session.document, thread.references);
    report({
      runId,
      name: 'ask.run',
      phase: 'start',
      at: Date.now(),
      data: { documentId: this.session.document.metadata.id, threadId: thread.id },
    });
    try {
      await this.save(thread);
      signal.throwIfAborted();
      const config = await this.models.load();
      signal.throwIfAborted();
      if (!config.hasKey) throw new AiError('unconfigured', '请先配置模型服务');
      const context = await askContext(
        this.session.document,
        thread.locator,
        thread.quote,
        catalog,
        signal,
      );
      const result = await runAgent({
        chat: this.models.chat,
        messages: askMessages(context, thread.messages),
        tools: documentTools(this.session.document, catalog, thread.locator),
        maxSteps: 5,
        runId,
        signal,
        onTrace: ({ spanId, parentId, ...event }) => report({ ...event, runId: spanId, parentId }),
        onEvent: (event) => {
          if (signal.aborted) return;
          this.state.update((state) => ({
            ...state,
            run: state.run
              ? {
                  ...state.run,
                  text:
                    event.type === 'text'
                      ? state.run.text + event.text
                      : event.type === 'step'
                        ? ''
                        : state.run.text,
                  activity: event.type === 'tool' ? `正在执行 ${event.name}…` : '正在思考…',
                  references: catalog.all(),
                }
              : null,
          }));
        },
      });
      signal.throwIfAborted();
      const answered: AskThread = {
        ...thread,
        references: catalog.all(),
        messages: [
          ...thread.messages,
          {
            role: 'assistant' as const,
            content: result.text,
            createdAt: Date.now(),
            model: result.model,
            usage: result.usage,
            runId,
          },
        ],
      };
      await this.save(answered);
      completed = answered;
      report({
        runId,
        name: 'ask.run',
        phase: 'complete',
        at: Date.now(),
        data: { model: result.model, usage: result.usage ? { ...result.usage } : null },
      });
    } catch (error) {
      report({
        runId,
        name: 'ask.run',
        phase: signal.aborted ? 'cancelled' : 'failed',
        at: Date.now(),
        data: { message: error instanceof Error ? error.message : String(error) },
      });
      if (!signal.aborted)
        this.state.update((state) => ({
          ...state,
          failure: {
            threadId: thread.id,
            code: error instanceof AiError ? error.code : 'request',
            message: error instanceof Error ? error.message : String(error),
          },
        }));
    } finally {
      const results = await Promise.allSettled(events);
      if (results.some((result) => result.status === 'rejected') && !this.stopped)
        this.host.notify('部分任务记录未能保存');
      this.controller = undefined;
      this.state.update((state) => ({
        ...state,
        threads: state.threads.map((entry) =>
          completed && entry.id === thread.id ? completed : entry,
        ),
        run: null,
      }));
    }
  }
  trace(runId: string) {
    return this.host.tasks.list(runId);
  }
  stop() {
    this.controller?.abort();
  }
  dispose() {
    if (!this.closing) {
      this.stopped = true;
      this.session.signal.removeEventListener('abort', this.abort);
      this.stop();
      this.closing = (async () => {
        await this.pending;
        await this.loaded;
      })();
    }
    return this.closing;
  }
}
