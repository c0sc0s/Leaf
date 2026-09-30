import { useState } from 'react';
import { useStore } from '@leaf/plugin-sdk/react';
import { Button } from '@leaf/ui/primitives/button';
import type { AppServices } from '../compose';

export function PluginManagerView({ services }: { services: AppServices }) {
  const plugins = useStore(services.plugins.state),
    [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (id: string, operation: () => Promise<unknown>) => {
    setBusy(id);
    setError(null);
    try {
      await operation();
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  };
  return (
    <section className="preferences-section" aria-labelledby="plugins-heading">
      <div className="plugins-heading">
        <h3 id="plugins-heading">插件</h3>
        <Button
          disabled={!!busy}
          onClick={() => void run('install', () => services.plugins.install())}
        >
          安装插件包
        </Button>
      </div>
      <p className="small muted">安装本机的 .leaf-plugin 文件来扩展阅读器。</p>
      {error && <p role="alert">{error}</p>}
      <div className="plugin-list">
        {plugins.map((plugin) => (
          <article
            className="plugin-card"
            key={plugin.manifest.id}
            data-plugin-id={plugin.manifest.id}
          >
            <div>
              <strong>{plugin.manifest.name}</strong>
              <span className="small muted"> {plugin.manifest.version}</span>
              <p>{plugin.manifest.description}</p>
              <small>
                {plugin.status === 'failed'
                  ? plugin.error
                  : plugin.status === 'active'
                    ? '已启用'
                    : plugin.status === 'activating'
                      ? '正在启用…'
                      : '已停用'}
              </small>
            </div>
            <div className="plugin-actions">
              <Button
                variant="outline"
                disabled={!!busy}
                onClick={() =>
                  void run(plugin.manifest.id, () =>
                    services.plugins.setEnabled(plugin.manifest.id, plugin.status !== 'active'),
                  )
                }
              >
                {plugin.status === 'active' ? '停用' : '启用'}
              </Button>
              <Button
                variant="ghost"
                disabled={!!busy}
                onClick={() =>
                  void run(plugin.manifest.id, () => services.plugins.remove(plugin.manifest.id))
                }
              >
                卸载
              </Button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
