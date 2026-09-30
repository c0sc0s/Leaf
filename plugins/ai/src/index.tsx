import { useEffect } from 'react';
import type { ReadableSession, TextSelection } from '@leaf/contracts/reader';
import type { RendererPlugin } from '@leaf/plugin-sdk';
import { mountReact, useStore } from '@leaf/plugin-sdk/react';
import { ModelClient } from './models/client';
import { AskService } from './features/ask/service';
import { AskPanel } from './ui/AskPanel';
import { AiSettings } from './ui/AiSettings';
import type { PanelContext } from '@leaf/plugin-sdk/view';
import './ui/ask.css';

function Panel({ service, context }: { service: AskService; context: PanelContext }) {
  const state = useStore(service.state),
    config = useStore(service.models.state);
  useEffect(() => {
    void service.models.load().catch(() => {});
  }, [service]);
  const notify = (promise: Promise<unknown>) => {
    void promise.catch((error) => context.notify(String(error)));
  };
  return (
    <AskPanel
      threads={state.threads}
      active={state.threads.find((thread) => thread.id === state.activeId) ?? null}
      run={state.run}
      failure={state.failure?.threadId === state.activeId ? state.failure : null}
      ready={state.ready}
      config={config}
      loadTrace={(runId) => service.trace(runId)}
      label={(locator) => context.session.document.locators.label(locator)}
      onSelect={(id) => service.select(id)}
      onAsk={(question) => notify(service.ask(question))}
      onRetry={() => notify(service.ask())}
      onStop={() => service.stop()}
      onRemove={(id) => notify(service.remove(id))}
      onNavigate={(locator) => notify(context.session.navigate(locator))}
      onSettings={context.openSettings}
      onClose={context.close}
    />
  );
}

const plugin: RendererPlugin = {
  activate(context) {
    const models = new ModelClient(context.host.backend),
      services = new Map<string, AskService>();
    const get = (session: ReadableSession) => {
      let service = services.get(session.id);
      if (!service) {
        service = new AskService(session, context.host, models);
        services.set(session.id, service);
        session.signal.addEventListener(
          'abort',
          () => {
            void service!
              .dispose()
              .finally(() => {
                if (services.get(session.id) === service) services.delete(session.id);
              })
              .catch(() => {});
          },
          { once: true },
        );
      }
      return service;
    };
    const begin = async (session: ReadableSession, selection: TextSelection | null) => {
      await get(session).begin(selection);
    };
    context.scope.own({
      dispose: async () => {
        await Promise.all([...services.values()].map((service) => service.dispose()));
        services.clear();
      },
    });
    context.registerPanel({
      id: 'leaf.ai.panel',
      label: 'AI 问答',
      icon: 'Sparkles',
      mount: (container, panel) =>
        mountReact(container, <Panel service={get(panel.session)} context={panel} />),
    });
    context.registerSettings({
      id: 'leaf.ai.settings',
      label: 'AI 阅读助手',
      mount: (container) => mountReact(container, <AiSettings models={models} />),
    });
    context.registerSelectionAction({
      id: 'leaf.ai.ask',
      label: '问 AI',
      icon: 'Sparkles',
      available: ({ session, selection }) => !!session.document.content && !!selection,
      async run({ session, selection, openPanel }, signal) {
        await begin(session, selection);
        signal.throwIfAborted();
        openPanel('leaf.ai.panel', selection);
      },
    });
    context.registerToolbarAction({
      id: 'leaf.ai.open',
      label: 'AI 问答',
      icon: 'Sparkles',
      available: ({ session }) => !!session.document.content,
      run: ({ openPanel }) => openPanel('leaf.ai.panel'),
    });
    context.registerToolbarAction({
      id: 'leaf.ai.summarize',
      label: '总结当前位置',
      icon: 'Sparkles',
      available: ({ session }) => !!session.document.content,
      async run({ session, openPanel }, signal) {
        const service = get(session);
        await begin(session, null);
        signal.throwIfAborted();
        openPanel('leaf.ai.panel');
        void service.ask(
          '请总结当前位置所在章节的主要观点，引用原文位置，并说明值得继续阅读的部分。',
        );
      },
    });
  },
};
export default plugin;
