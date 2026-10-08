import { describe, expect, it } from 'vitest';
import type { BackendClient, PluginHostAPI, TaskEvent } from '@leaf/contracts/host';
import type { JsonValue } from '@leaf/shared/types';
import { AskService } from '../../../../src/features/ask/service';
import { ModelClient } from '../../../../src/models/client';
import { textDocument } from '../../../../../../tests/fixtures/document';

function setup(stream: BackendClient['stream']) {
  const fixture = textDocument(),
    saved = new Map<string, JsonValue>(),
    events: TaskEvent[] = [];
  const backend: BackendClient = {
    async request<T extends JsonValue>() {
      return {
        baseURL: 'http://localhost',
        model: 'test',
        hasKey: true,
        managed: false,
      } as unknown as T;
    },
    stream,
  };
  const host: PluginHostAPI = {
    reading: { active: () => fixture.session },
    library: { list: async () => [fixture.document.metadata] },
    backend,
    notify() {},
    storage: {
      async get<T extends JsonValue>(key: string) {
        return (saved.get(key) ?? null) as T | null;
      },
      async set(key, value) {
        saved.set(key, structuredClone(value));
      },
      async delete(key) {
        saved.delete(key);
      },
      async list(prefix) {
        return [...saved]
          .filter(([key]) => key.startsWith(prefix))
          .map(([key, value]) => ({ key, value }));
      },
    },
    tasks: {
      async report(event) {
        events.push(event);
      },
      async list() {
        return events;
      },
    },
  };
  const models = new ModelClient(backend),
    service = new AskService(fixture.session, host, models);
  return { ...fixture, host, models, service, saved, events };
}

describe('AI session harness', () => {
  it('publishes the completed reply and ends streaming in one observable transition', async () => {
    const { service } = setup(async (_method, _input, { onEvent }) => {
      onEvent({ type: 'text', text: 'Completed answer' });
      onEvent({ type: 'done', model: 'test', finishReason: 'stop', toolCalls: [], usage: null });
    });
    const overlapping: boolean[] = [];
    const stop = service.state.subscribe(() => {
      const { threads, run } = service.state.get();
      overlapping.push(
        !!run &&
          threads.some((thread) => thread.messages.some((message) => message.runId === run.runId)),
      );
    });
    await service.begin(null);
    await service.ask('Question');
    expect(service.state.get().threads[0].messages[1].content).toBe('Completed answer');
    expect(service.state.get().run).toBeNull();
    expect(overlapping).not.toContain(true);
    stop();
    await service.dispose();
  });
  it('persists protocol-based references, model usage and trace, and reloads the completed thread', async () => {
    const { service, session, host, models, saved, events, locator } = setup(
      async (_method, input, { onEvent }) => {
        expect((input as { maxTokens: number }).maxTokens).toBe(4096);
        onEvent({ type: 'text', text: 'Read the original passage [ref.1].' });
        onEvent({
          type: 'done',
          model: 'test',
          finishReason: 'stop',
          toolCalls: [],
          usage: { promptTokens: 40, completionTokens: 10, cachedTokens: 5 },
        });
      },
    );
    await service.begin({ quote: 'original passage', anchors: [locator(1)] });
    await service.ask('Explain it.');
    expect(saved.size).toBe(1);
    expect(service.state.get().threads[0].messages[1].usage?.completionTokens).toBe(10);
    expect(
      events.filter((event) => event.name === 'model.completion').map((event) => event.phase),
    ).toEqual(['start', 'complete']);
    expect(events.at(-1)?.phase).toBe('complete');
    const restored = new AskService(session, host, models);
    await restored.begin(null);
    expect(
      restored.state.get().threads.some((thread) => thread.messages[0]?.content === 'Explain it.'),
    ).toBe(true);
    await Promise.all([service.dispose(), restored.dispose()]);
  });
  it('keeps one pending question on cancellation and waits for final trace writes during repeated disposal', async () => {
    let started!: () => void;
    const streaming = new Promise<void>((resolve) => {
      started = resolve;
    });
    const { service, controller, saved, events } = setup(async (_method, _input, { signal }) => {
      started();
      await new Promise<void>((resolve) =>
        signal.addEventListener('abort', () => resolve(), { once: true }),
      );
    });
    await service.begin(null);
    const pending = service.ask('Question');
    await streaming;
    controller.abort();
    const disposal = service.dispose();
    expect(service.dispose()).toBe(disposal);
    await disposal;
    await pending;
    expect(service.state.get().run).toBe(null);
    expect(
      (saved.values().next().value as unknown as { messages: unknown[] }).messages,
    ).toHaveLength(1);
    expect(events.at(-1)?.phase).toBe('cancelled');
  });
  it('does not store partial answers as successful replies and can retry the same question', async () => {
    let attempt = 0;
    const { service } = setup(async (_method, _input, { onEvent }) => {
      if (!attempt++) {
        onEvent({ type: 'text', text: 'Partial answer' });
        throw new Error('Disconnected');
      }
      onEvent({ type: 'done', model: 'test', finishReason: 'stop', toolCalls: [], usage: null });
    });
    await service.begin(null);
    await service.ask('Question');
    expect(service.state.get().failure?.message).toBe('Disconnected');
    expect(service.state.get().threads[0].messages).toHaveLength(1);
    await service.ask();
    expect(service.state.get().threads[0].messages).toHaveLength(2);
    expect(service.state.get().threads[0].messages[1].usage).toBe(null);
    await service.dispose();
  });
});
