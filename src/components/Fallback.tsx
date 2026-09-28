import { Button } from './ui/button';
import { WindowControls } from './WindowControls';
import './fallback.css';

interface Props {
  error: Error;
  componentStack?: string | null;
  onRetry: () => void;
}

export function Fallback({ error, componentStack, onRetry }: Props) {
  const platform = window.desktop?.platform;
  const nativeClass =
    platform === 'win32' ? 'native-win' : platform === 'darwin' ? 'native-mac' : '';
  const message = `${error.name}: ${error.message}`;

  return (
    <div className="app-shell error-fallback">
      <header className={`titlebar ${nativeClass}`}>Leaf</header>
      <WindowControls />
      <main className="error-fallback-content" aria-labelledby="error-fallback-title">
        <div className="error-fallback-card">
          <h1 id="error-fallback-title">应用出现错误</h1>
          <p>当前页面无法继续显示。你可以重试或重新加载应用。</p>
          <p className="error-fallback-message" role="alert">
            {message}
          </p>
          <div className="error-fallback-actions">
            <Button type="button" onClick={onRetry}>
              重试
            </Button>
            <Button type="button" variant="outline" onClick={() => window.location.reload()}>
              重新加载
            </Button>
          </div>
          <section aria-labelledby="error-stack-title">
            <h2 id="error-stack-title">错误栈</h2>
            <pre className="error-fallback-stack" tabIndex={0}>
              {error.stack || message}
            </pre>
          </section>
          {componentStack && (
            <section aria-labelledby="component-stack-title">
              <h2 id="component-stack-title">组件栈</h2>
              <pre className="error-fallback-stack" tabIndex={0}>
                {componentStack.trim()}
              </pre>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
