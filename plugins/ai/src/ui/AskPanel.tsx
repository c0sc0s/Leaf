import { memo, useEffect, useRef, useState } from 'react';
import { ReaderPanel } from '@leaf/ui/reading/ReaderPanel';
import { Button } from '@leaf/ui/primitives/button';
import { Card } from '@leaf/ui/primitives/card';
import { Textarea } from '@leaf/ui/primitives/textarea';
import { ArrowLeft, ArrowUp, Stop, Trash2, X } from '@leaf/ui/icons';
import { IconButton, ShimmerText } from '@leaf/ui/primitives/composition';
import type { Locator } from '@leaf/contracts/documents';
import type { TaskEvent } from '@leaf/contracts/host';
import type { AskThread, AskFailure, AskRun, AskMessage } from '../features/ask/service';
import type { ModelConfigState } from '../models/client';
import { useResizablePanel } from '@leaf/ui/hooks/useResizablePanel';
import { AnswerContent } from './AnswerContent';
import './ask.css';

function ThreadList({
  threads,
  label,
  onSelect,
  onRemove,
}: {
  threads: AskThread[];
  label: (locator: Locator) => string;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  if (!threads.length)
    return (
      <p className="ask-empty">选中书中的文字，点击工具栏里的“问 AI”，就可以针对这段内容提问。</p>
    );
  return (
    <div className="notes-list">
      {threads.map((thread) => (
        <Card size="sm" className="note-card ask-thread-card" key={thread.id}>
          <div className="note-card-top">
            <span className="note-page">{label(thread.locator)}</span>
            <IconButton label="删除这组问答" onClick={() => onRemove(thread.id)}>
              <Trash2 size={13} />
            </IconButton>
          </div>
          <Button variant="ghost" className="ask-thread-open" onClick={() => onSelect(thread.id)}>
            <span className="ask-thread-quote">{thread.quote}</span>
            <span className="ask-thread-question">{thread.messages[0]?.content}</span>
          </Button>
        </Card>
      ))}
    </div>
  );
}

function Composer({
  running,
  disabled,
  onAsk,
  onStop,
}: {
  running: boolean;
  disabled: boolean;
  onAsk: (question: string) => void;
  onStop: () => void;
}) {
  const [question, setQuestion] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => input.current?.focus(), []);
  const submit = () => {
    if (!question.trim() || running || disabled) return;
    onAsk(question);
    setQuestion('');
  };
  return (
    <form
      className="ask-composer"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Textarea
        ref={input}
        aria-label="输入问题"
        placeholder="这段话是什么意思？"
        value={question}
        disabled={disabled}
        onChange={(event) => setQuestion(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            submit();
          }
        }}
      />
      {running ? (
        <IconButton label="停止回答" type="button" onClick={onStop}>
          <Stop size={16} />
        </IconButton>
      ) : (
        <IconButton label="发送问题" type="submit" disabled={disabled || !question.trim()}>
          <ArrowUp size={16} />
        </IconButton>
      )}
    </form>
  );
}

export const AskPanel = memo(function AskPanel({
  label,
  threads,
  active,
  run,
  failure,
  ready,
  config,
  loadTrace,
  onSelect,
  onAsk,
  onRetry,
  onStop,
  onRemove,
  onNavigate,
  onSettings,
  onClose,
}: {
  label: (locator: Locator) => string;
  threads: AskThread[];
  active: AskThread | null;
  run: AskRun | null;
  failure: AskFailure | null;
  ready: boolean;
  config: ModelConfigState;
  loadTrace: (runId: string) => Promise<TaskEvent[]>;
  onSelect: (id: string | null) => void;
  onAsk: (question: string) => void;
  onRetry: () => void;
  onStop: () => void;
  onRemove: (id: string) => void;
  onNavigate: (locator: Locator) => void;
  onSettings: () => void;
  onClose: () => void;
}) {
  const { width, panel, handleProps } = useResizablePanel<HTMLElement>({
    storageKey: 'leaf-ask-width',
    min: 300,
    max: 640,
    initial: 380,
    edge: 'left',
  });
  const configured = config.status === 'ready' && config.config.hasKey;
  const scroller = useRef<HTMLDivElement>(null);
  const streaming = run && run.threadId === active?.id ? run : null;
  const lastRole = active?.messages.at(-1)?.role;
  useEffect(() => {
    const box = scroller.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [active?.id, active?.messages.length, streaming?.text, streaming?.activity, failure]);
  const cite = onNavigate;
  return (
    <ReaderPanel className="ask-panel" ref={panel} style={{ width }}>
      <div {...handleProps} />
      <div className="notes-heading">
        {active && (
          <IconButton label="全部问答" onClick={() => onSelect(null)}>
            <ArrowLeft size={16} />
          </IconButton>
        )}
        <h3>AI 问答 {!active && <span>{threads.length}</span>}</h3>
        <IconButton label="关闭 AI 问答" onClick={onClose}>
          <X size={16} />
        </IconButton>
      </div>
      {config.status === 'error' ? (
        <p className="ask-notice" role="alert">
          {config.message}
        </p>
      ) : (
        config.status === 'ready' &&
        !configured && (
          <div className="ask-notice">
            <p>先在插件设置中配置模型服务。</p>
            <Button variant="outline" size="sm" onClick={onSettings}>
              打开阅读偏好
            </Button>
          </div>
        )
      )}
      {active ? (
        <>
          <div className="ask-thread" ref={scroller}>
            <blockquote className="ask-quote">
              <p>{active.quote}</p>
              <Button
                variant="ghost"
                className="note-page"
                onClick={() => onNavigate(active.locator)}
              >
                {label(active.locator)}
              </Button>
            </blockquote>
            {active.messages.map((message, index) =>
              message.role === 'user' ? (
                <p className="ask-question" key={index}>
                  {message.content}
                </p>
              ) : (
                <div key={index}>
                  <AnswerContent
                    markdown={message.content}
                    references={active.references}
                    onCite={cite}
                  />
                  <AnswerDetails message={message} loadTrace={loadTrace} />
                </div>
              ),
            )}
            {streaming && (
              <>
                {streaming.text ? (
                  <AnswerContent
                    markdown={streaming.text}
                    references={streaming.references}
                    onCite={cite}
                  />
                ) : (
                  <p className="ask-activity">
                    <ShimmerText text={streaming.activity ?? '正在思考…'} />
                  </p>
                )}
              </>
            )}
            {failure ? (
              <div className="ask-error" role="alert">
                <p>{failure.message}</p>
                <div>
                  {['unconfigured', 'auth', 'config'].includes(failure.code) && (
                    <Button variant="outline" size="sm" onClick={onSettings}>
                      打开阅读偏好
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={onRetry}>
                    重试
                  </Button>
                </div>
              </div>
            ) : (
              !streaming &&
              lastRole === 'user' && (
                <div className="ask-error">
                  <p>回答已停止。</p>
                  <Button variant="outline" size="sm" onClick={onRetry}>
                    重新回答
                  </Button>
                </div>
              )
            )}
          </div>
          <Composer
            key={active.id}
            running={Boolean(run)}
            disabled={!ready || !configured}
            onAsk={onAsk}
            onStop={onStop}
          />
        </>
      ) : (
        <ThreadList threads={threads} label={label} onSelect={onSelect} onRemove={onRemove} />
      )}
    </ReaderPanel>
  );
});

function AnswerDetails({
  message,
  loadTrace,
}: {
  message: AskMessage;
  loadTrace(runId: string): Promise<TaskEvent[]>;
}) {
  const [events, setEvents] = useState<TaskEvent[] | null>(null),
    [failure, setFailure] = useState('');
  if (!message.runId) return null;
  return (
    <details
      className="ask-details"
      onToggle={(event) => {
        if (event.currentTarget.open && !events && !failure)
          void loadTrace(message.runId!)
            .then(setEvents)
            .catch((error) => setFailure(String(error)));
      }}
    >
      <summary>模型与执行记录</summary>
      <p>
        {message.model}
        {message.usage
          ? ` · 输入 ${message.usage.promptTokens} / 输出 ${message.usage.completionTokens} tokens · 缓存命中 ${message.usage.cachedTokens}`
          : ' · 服务未返回用量'}
      </p>
      {failure ? (
        <p role="alert">{failure}</p>
      ) : events ? (
        <ol>
          {events
            .filter((event) => event.phase !== 'start')
            .map((event, index) => (
              <li key={index}>
                {event.name} · {event.phase}
                {event.data?.message ? ` · ${event.data.message}` : ''}
              </li>
            ))}
        </ol>
      ) : (
        <p>正在读取记录…</p>
      )}
    </details>
  );
}
