import { memo, useEffect, useRef, useState } from 'react';
import { m } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, ArrowUp, Stop, Trash2, X } from '@/components/icons';
import { IconButton, ShimmerText } from '@/components/UI';
import { slideFrom } from '@/lib/motion';
import { unitLabel, type DocumentUnit } from '@/ai/document';
import type { AskThread } from '@/ai/askStore';
import { useResizablePanel } from '../reader/useResizablePanel';
import { AnswerContent } from './AnswerContent';
import { useAiConfig } from './useAiConfig';
import type { AskFailure, AskRun } from './useAsk';
import './ask.css';

function ThreadList({
  threads,
  unit,
  onSelect,
  onRemove,
}: {
  threads: AskThread[];
  unit: DocumentUnit;
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
            <span className="note-page">{unitLabel(unit, thread.page)}</span>
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
  unit,
  threads,
  active,
  run,
  failure,
  ready,
  onSelect,
  onAsk,
  onRetry,
  onStop,
  onRemove,
  onNavigate,
  onSettings,
  onClose,
}: {
  unit: DocumentUnit;
  threads: AskThread[];
  active: AskThread | null;
  run: AskRun | null;
  failure: AskFailure | null;
  ready: boolean;
  onSelect: (id: string | null) => void;
  onAsk: (question: string) => void;
  onRetry: () => void;
  onStop: () => void;
  onRemove: (id: string) => void;
  /** `offset` is the quote's position; citations only carry a page. */
  onNavigate: (page: number, offset?: number) => void;
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
  const config = useAiConfig();
  const configured = config.status === 'ready' && config.config.hasKey;
  const scroller = useRef<HTMLDivElement>(null);
  const streaming = run && run.threadId === active?.id ? run : null;
  const lastRole = active?.messages.at(-1)?.role;
  useEffect(() => {
    const box = scroller.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [active?.id, active?.messages.length, streaming?.text, streaming?.activity, failure]);
  const cite = (page: number) => onNavigate(page);
  return (
    <m.aside
      className="notes-panel ask-panel"
      ref={panel}
      style={{ width }}
      {...slideFrom('right')}
    >
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
            <p>先在阅读偏好里配置模型服务，例如 DeepSeek。</p>
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
                onClick={() => onNavigate(active.page, active.start)}
              >
                {unitLabel(unit, active.page)}
              </Button>
            </blockquote>
            {active.messages.map((message, index) =>
              message.role === 'user' ? (
                <p className="ask-question" key={index}>
                  {message.content}
                </p>
              ) : (
                <AnswerContent key={index} markdown={message.content} unit={unit} onCite={cite} />
              ),
            )}
            {streaming && (
              <>
                {streaming.text ? (
                  <AnswerContent markdown={streaming.text} unit={unit} onCite={cite} />
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
        <ThreadList threads={threads} unit={unit} onSelect={onSelect} onRemove={onRemove} />
      )}
    </m.aside>
  );
});
