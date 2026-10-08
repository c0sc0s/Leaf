import { useState } from 'react';
import { useStore } from '@leaf/plugin-sdk/react';
import { BookOpen, Grid2X2, MoreHorizontal, Plus, Trash2 } from '@leaf/ui/icons';
import { Badge } from '@leaf/ui/primitives/badge';
import { Button } from '@leaf/ui/primitives/button';
import { Card } from '@leaf/ui/primitives/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@leaf/ui/primitives/dropdown-menu';
import { Switch } from '@leaf/ui/primitives/switch';
import type { AppServices } from '../compose';
import './plugins.css';

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
    <section className="preferences-section preferences-plugins" aria-labelledby="plugins-heading">
      <div className="plugins-heading">
        <div className="plugins-heading-copy">
          <h3 id="plugins-heading">插件</h3>
          <span className="plugins-count">已安装 {plugins.length} 个</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={!!busy}
          onClick={() => void run('install', () => services.plugins.install())}
        >
          <Plus size={14} />
          {busy === 'install' ? '正在安装…' : '安装插件包'}
        </Button>
      </div>
      <p className="plugins-intro">添加新的阅读格式和功能，让 Leaf 更适合你。</p>
      {error && (
        <div className="plugins-error" role="alert">
          <strong>操作未完成</strong>
          <p>{error}</p>
        </div>
      )}
      <div className="plugin-list" aria-busy={!!busy}>
        {plugins.map((plugin) => {
          const { id, name, version, description, contributes } = plugin.manifest;
          const reader = !!contributes.documentProviders?.length;
          const status =
            plugin.status === 'failed'
              ? '启用失败'
              : busy === id
                ? '正在处理…'
                : plugin.status === 'active'
                  ? '已启用'
                  : plugin.status === 'activating'
                    ? '正在启用…'
                    : '已停用';
          return (
            <Card
              className="plugin-card"
              key={id}
              data-plugin-id={id}
              data-status={plugin.status}
              role="group"
              aria-label={name}
            >
              <div className="plugin-icon" aria-hidden="true">
                {reader ? <BookOpen size={20} /> : <Grid2X2 size={20} />}
              </div>
              <div className="plugin-details">
                <div className="plugin-title">
                  <h4>{name}</h4>
                  <span className="plugin-version">v{version}</span>
                </div>
                <p className="plugin-description">{description}</p>
                <div className="plugin-meta">
                  <Badge variant="secondary" className="plugin-kind">
                    {reader ? '阅读格式' : '功能扩展'}
                  </Badge>
                  <span className="plugin-status">
                    <span className="plugin-status-dot" aria-hidden="true" />
                    {status}
                  </span>
                </div>
                {plugin.status === 'failed' && (
                  <p className="plugin-failure">{plugin.error || '请重试启用此插件。'}</p>
                )}
              </div>
              <div className="plugin-actions">
                <Switch
                  aria-label={`启用 ${name}`}
                  checked={plugin.enabled}
                  disabled={!!busy || plugin.status === 'activating'}
                  onCheckedChange={(enabled) =>
                    void run(id, () => services.plugins.setEnabled(id, enabled))
                  }
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`${name} 更多操作`}
                      disabled={!!busy}
                    >
                      <MoreHorizontal size={16} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="plugin-menu">
                    {plugin.status === 'failed' && (
                      <DropdownMenuItem
                        onSelect={() => void run(id, () => services.plugins.setEnabled(id, true))}
                      >
                        重试启用
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => void run(id, () => services.plugins.remove(id))}
                    >
                      <Trash2 size={14} />
                      卸载
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </Card>
          );
        })}
      </div>
      <p className="plugins-hint">支持 .leaf-plugin 文件 · 至少保留一个启用的阅读插件</p>
    </section>
  );
}
