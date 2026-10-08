import { useState } from 'react';
import { useStore } from '@leaf/plugin-sdk/react';
import { Button } from '@leaf/ui/primitives/button';
import { X } from '@leaf/ui/icons';
import type { UpdatesClient } from '../../platform/updates';

export function UpdatePanel({ updates }: { updates: UpdatesClient }) {
  const state = useStore(updates.state);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await operation();
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  const working = busy || ['checking', 'downloading', 'installing'].includes(state.status);
  const message = {
    disabled: state.reason,
    idle: `当前版本 ${state.currentVersion}`,
    checking: '正在检查更新…',
    current: '已是最新版本',
    available: `发现新版本 ${state.release?.version}`,
    downloading: `正在下载 ${Math.round(state.progress ?? 0)}%`,
    downloaded: `新版本 ${state.release?.version} 已下载`,
    installing: '正在保存并准备重启…',
    error: '更新未完成，可以重试或从发布页面下载',
  }[state.status];
  const failure = error ?? state.error;
  return (
    <section className="update-panel" aria-labelledby="update-heading">
      <div className="update-heading">
        <div>
          <h3 id="update-heading">应用更新</h3>
          <p role="status" aria-live="polite">
            {message}
          </p>
        </div>
        {state.status !== 'disabled' && (
          <Button
            variant="outline"
            size="sm"
            disabled={working || state.status === 'downloaded'}
            onClick={() => void run(updates.check)}
          >
            检查更新
          </Button>
        )}
      </div>
      {state.status === 'downloading' && (
        <progress aria-label="更新下载进度" max={100} value={state.progress ?? 0} />
      )}
      {failure && (
        <p className="update-error" role="alert">
          {failure}
        </p>
      )}
      {state.release && (
        <>
          {state.release.notes && (
            <details className="update-notes">
              <summary>更新说明</summary>
              <p>{state.release.notes}</p>
            </details>
          )}
          {state.installMode === 'manual' && <p className="muted">{state.reason}</p>}
        </>
      )}
      {state.status !== 'disabled' && (
        <div className="update-actions">
          {state.status === 'downloaded' ? (
            <Button size="sm" disabled={working} onClick={() => void run(updates.install)}>
              重启并更新
            </Button>
          ) : state.release &&
            state.installMode === 'automatic' &&
            ['available', 'error'].includes(state.status) ? (
            <Button size="sm" disabled={working} onClick={() => void run(updates.download)}>
              下载更新
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            disabled={working}
            onClick={() => void run(updates.openRelease)}
          >
            {state.installMode === 'manual' && state.release ? '下载新版本' : '查看发布页面'}
          </Button>
        </div>
      )}
    </section>
  );
}

export function UpdateNotice({ updates, onOpen }: { updates: UpdatesClient; onOpen(): void }) {
  const state = useStore(updates.state);
  const [dismissed, setDismissed] = useState('');
  const key = `${state.release?.version}:${state.status}`;
  if (!state.release || !['available', 'downloaded'].includes(state.status) || dismissed === key)
    return null;
  return (
    <aside className="update-notice" role="status">
      <Button variant="ghost" size="sm" onClick={onOpen}>
        {state.status === 'downloaded'
          ? '更新已下载，重启后即可使用'
          : `Leaf ${state.release.version} 可更新`}
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="稍后查看更新"
        onClick={() => setDismissed(key)}
      >
        <X size={14} />
      </Button>
    </aside>
  );
}
