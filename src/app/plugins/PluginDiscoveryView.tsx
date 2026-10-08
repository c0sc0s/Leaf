import { useEffect, useState } from 'react';
import { useStore } from '@leaf/plugin-sdk/react';
import type { CatalogEntry } from '@leaf/contracts/catalog';
import { compareVersions } from '@leaf/contracts/catalog';
import type { CatalogPlan } from '../../core/plugins/catalog';
import type { AppServices } from '../compose';
import { BookOpen, Grid2X2, Search, Check } from '@leaf/ui/icons';
import { Badge } from '@leaf/ui/primitives/badge';
import { Button } from '@leaf/ui/primitives/button';
import { Card } from '@leaf/ui/primitives/card';
import { Input } from '@leaf/ui/primitives/input';
import { ToggleGroup, ToggleGroupItem } from '@leaf/ui/primitives/toggle-group';
import { Modal } from '@leaf/ui/primitives/composition';

const permissions: Record<string, string> = {
  documents: '读取当前文档和阅读上下文',
  storage: '保存插件设置和文档数据',
  backend: '运行本机后台代码',
  credentials: '保存和读取插件自己的凭据',
  network: '访问网络服务',
};
export function PluginDiscoveryView({ services }: { services: AppServices }) {
  const state = useStore(services.catalog.state),
    installed = useStore(services.plugins.state);
  const [query, setQuery] = useState(''),
    [category, setCategory] = useState('all');
  const [selected, setSelected] = useState<CatalogEntry | null>(null),
    [error, setError] = useState<string>();
  useEffect(() => {
    void services.catalog.load();
  }, [services]);
  const entries = (state.snapshot?.catalog.plugins ?? []).filter((entry) => {
    const reader = !!entry.manifest.contributes.documentProviders?.length;
    return (
      (category === 'all' || (category === 'reader' ? reader : !reader)) &&
      `${entry.manifest.name} ${entry.manifest.description} ${entry.author}`
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase())
    );
  });
  const action = (entry: CatalogEntry) => {
    const current = installed.find((plugin) => plugin.manifest.id === entry.manifest.id);
    if (!current) return '安装';
    if (
      compareVersions(entry.manifest.version, current.manifest.version) > 0 ||
      (entry.manifest.version === current.manifest.version &&
        entry.download.sha256 !== current.packageHash)
    )
      return '更新';
    return current.status === 'active' ? '已安装' : '启用';
  };
  const busy = !!state.progress;
  return (
    <div className="plugin-discovery">
      <div className="catalog-search">
        <Search size={15} />
        <Input
          aria-label="搜索插件"
          placeholder="搜索名称、功能或作者…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="catalog-toolbar">
        <ToggleGroup
          type="single"
          value={category}
          onValueChange={(value) => {
            if (value) setCategory(value);
          }}
          aria-label="插件分类"
          size="sm"
        >
          <ToggleGroupItem value="all">全部</ToggleGroupItem>
          <ToggleGroupItem value="reader">阅读格式</ToggleGroupItem>
          <ToggleGroupItem value="feature">功能扩展</ToggleGroupItem>
        </ToggleGroup>
        <Button
          variant="ghost"
          size="xs"
          disabled={state.loading || busy}
          onClick={() => {
            setError(undefined);
            void services.catalog.load(true);
          }}
        >
          刷新目录
        </Button>
      </div>
      {(error || state.error) && (
        <div className="plugins-error" role="alert">
          {error || state.error}
        </div>
      )}
      {state.snapshot && (
        <p className="catalog-source">
          <Check size={12} />
          官方目录 · 签名已验证{state.snapshot.offline ? ' · 正在使用离线缓存' : ''}
        </p>
      )}
      {state.progress && (
        <div className="catalog-progress" aria-label="插件安装进度">
          <div>
            <span>{state.progress.stage === 'download' ? '正在下载插件…' : '正在安装插件…'}</span>
            {state.progress.stage === 'download' && (
              <Button variant="ghost" size="xs" onClick={() => services.catalog.cancel()}>
                取消下载
              </Button>
            )}
          </div>
          <progress max={state.progress.total || 1} value={state.progress.received} />
          <span>
            {size(state.progress.received)} / {size(state.progress.total)}
          </span>
        </div>
      )}
      {state.loading && !state.snapshot && <p className="catalog-empty">正在加载插件目录…</p>}
      <div className="plugin-list">
        {entries.map((entry) => {
          const reader = !!entry.manifest.contributes.documentProviders?.length;
          return (
            <Card
              key={entry.manifest.id}
              className="plugin-card catalog-card"
              data-catalog-id={entry.manifest.id}
            >
              <div className="plugin-icon" aria-hidden="true">
                {reader ? <BookOpen size={20} /> : <Grid2X2 size={20} />}
              </div>
              <div className="plugin-details">
                <div className="plugin-title">
                  <h4>{entry.manifest.name}</h4>
                  <span className="plugin-version">v{entry.manifest.version}</span>
                </div>
                <p className="plugin-description">{entry.manifest.description}</p>
                <div className="plugin-meta">
                  <Badge variant="secondary" className="plugin-kind">
                    {reader ? '阅读格式' : '功能扩展'}
                  </Badge>
                  <span className="plugin-version">
                    {entry.author} · {size(entry.download.size)}
                  </span>
                </div>
              </div>
              <Button
                variant={action(entry) === '已安装' ? 'ghost' : 'outline'}
                size="xs"
                disabled={busy}
                onClick={() => {
                  setError(undefined);
                  setSelected(entry);
                }}
                aria-label={`查看 ${entry.manifest.name} 详情`}
              >
                {action(entry) === '已安装' ? '详情' : action(entry)}
              </Button>
            </Card>
          );
        })}
      </div>
      {!state.loading && state.snapshot && !entries.length && (
        <p className="catalog-empty">没有找到匹配的插件。</p>
      )}
      {selected && (
        <CatalogDetails
          entry={selected}
          services={services}
          action={action(selected)}
          onClose={() => setSelected(null)}
          onInstall={(plan) => {
            const id = selected.manifest.id;
            setSelected(null);
            void services.catalog
              .install(id, plan)
              .catch((error) => setError(error instanceof Error ? error.message : String(error)));
          }}
        />
      )}
    </div>
  );
}
function CatalogDetails({
  entry,
  services,
  action,
  onClose,
  onInstall,
}: {
  entry: CatalogEntry;
  services: AppServices;
  action: string;
  onClose: () => void;
  onInstall: (plan: CatalogPlan) => void;
}) {
  let plan: CatalogPlan | undefined, error: string | undefined;
  try {
    plan = services.catalog.plan(entry.manifest.id);
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause);
  }
  const installed = services.plugins.state.get();
  const required = [
    ...new Set([
      ...entry.manifest.permissions,
      ...(plan?.entries.flatMap((item) => item.manifest.permissions) ?? []),
      ...(plan?.enable.flatMap(
        (id) => installed.find((plugin) => plugin.manifest.id === id)?.manifest.permissions ?? [],
      ) ?? []),
    ]),
  ];
  const dependencies = [
    ...(plan?.entries
      .filter((item) => item.manifest.id !== entry.manifest.id)
      .map((item) => item.manifest.name) ?? []),
    ...(plan?.enable
      .filter((id) => id !== entry.manifest.id)
      .map((id) => installed.find((plugin) => plugin.manifest.id === id)?.manifest.name ?? id) ??
      []),
  ];
  return (
    <Modal title={entry.manifest.name} className="catalog-dialog" onClose={onClose}>
      <div className="catalog-detail-body">
        <p className="catalog-detail-meta">
          {entry.author} · v{entry.manifest.version} · {size(entry.download.size)}
        </p>
        <p className="catalog-detail-description">{entry.details}</p>
        <h3>使用的权限</h3>
        {required.length ? (
          <ul>
            {required.map((permission) => (
              <li key={permission}>{permissions[permission] ?? permission}</li>
            ))}
          </ul>
        ) : (
          <p>此插件不申请额外权限。</p>
        )}
        {!!dependencies.length && (
          <div className="catalog-dependencies">
            <h3>一同安装或启用的依赖</h3>
            <p>{dependencies.join('、')}</p>
            <p>上述权限包含这些依赖插件。</p>
          </div>
        )}
        {error && (
          <div className="plugins-error" role="alert">
            {error}
          </div>
        )}
        {action === '更新' && (
          <p className="catalog-update-note">插件数据会保留，更新完成后应用将重新加载。</p>
        )}
      </div>
      <div className="catalog-detail-footer">
        <Button variant="ghost" onClick={onClose}>
          关闭
        </Button>
        {plan && !!(plan.entries.length || plan.enable.length) && (
          <Button onClick={() => onInstall(plan!)}>
            {action === '更新' ? '确认更新' : action === '启用' ? '确认启用' : '确认安装'}
          </Button>
        )}
      </div>
    </Modal>
  );
}
function size(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
