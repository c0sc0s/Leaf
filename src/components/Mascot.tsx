import type { ReactNode } from 'react';
import { Button } from './ui/button';
import { cn } from '../lib/utils';
import './mascot.css';

const mascotScenes = {
  reading: 'reading',
  welcome: 'welcome-sleeping',
  library: 'empty-library',
  search: 'empty-search',
  favorites: 'empty-favorites',
  settings: 'settings',
  bookmarks: 'empty-bookmarks',
  notes: 'empty-notes',
  tags: 'empty-tags',
  outline: 'empty-outline',
  notFound: 'not-found',
} as const;
export type MascotScene = keyof typeof mascotScenes;

export function Mascot({
  scene,
  size = 'page',
  className,
}: {
  scene: MascotScene;
  size?: 'page' | 'sidebar' | 'compact';
  className?: string;
}) {
  const source = `${import.meta.env.BASE_URL}mascot/${mascotScenes[scene]}`;
  return (
    <span className={cn('leaf-mascot', `leaf-mascot--${size}`, className)} aria-hidden="true">
      <img
        src={`${source}.png`}
        alt=""
        width="240"
        height="240"
        draggable={false}
        decoding="async"
      />
    </span>
  );
}

const emptyCopy = {
  library: ['放进你的第一本书', '导入 PDF、Markdown 文件或文件夹，也可以拖到窗口中。'],
  search: ['还没找到这本书', '试试其他书名或作者，或清空搜索。'],
  favorites: ['把喜欢的书留在这里', '点击书籍上的爱心，即可加入收藏。'],
  notes: ['记下第一个想法', '选中文字，添加高亮、划线或笔记。内容会自动保存。'],
  bookmarks: ['留个位置，下次接着读', '点击顶部的书签按钮，收藏当前页。'],
  tags: ['用标签整理内容', '为内容添加标签，让相关想法更容易找到。'],
  outline: ['这份 PDF 没有目录', '可以通过页面缩略图浏览，或为常读的页面添加书签。'],
  recent: ['从一本书开始', '打开书架中的任意一本书，这里会记住你的阅读足迹。'],
} as const;
export type EmptyScene = keyof typeof emptyCopy;

export function EmptyState({
  scene,
  compact = false,
  title,
  description,
  action,
}: {
  scene: EmptyScene;
  compact?: boolean;
  title?: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}) {
  const copy = emptyCopy[scene];
  return (
    <section
      className={cn('leaf-empty', compact && 'leaf-empty--sidebar')}
      data-empty-scene={scene}
    >
      <Mascot scene={scene === 'recent' ? 'welcome' : scene} size={compact ? 'sidebar' : 'page'} />
      <h3>{title || copy[0]}</h3>
      <p>{description || copy[1]}</p>
      {action && (
        <Button variant={compact ? 'outline' : 'default'} size="sm" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </section>
  );
}

export function NotFound({ onHome, onBack }: { onHome: () => void; onBack?: () => void }) {
  return (
    <main className="leaf-not-found">
      <Mascot scene="notFound" />
      <span className="leaf-error-code">404</span>
      <h1>这一页，好像走丢了。</h1>
      <p>页面可能已移动，或链接已失效。</p>
      <div className="leaf-state-actions">
        <Button onClick={onHome}>返回书架</Button>
        {onBack && (
          <Button variant="outline" onClick={onBack}>
            返回上一页
          </Button>
        )}
      </div>
    </main>
  );
}

export function SettingsIllustration({ children }: { children?: ReactNode }) {
  return (
    <div className="leaf-settings-intro">
      <Mascot scene="settings" size="compact" />
      <p>{children || '把阅读调成你喜欢的样子。'}</p>
    </div>
  );
}
