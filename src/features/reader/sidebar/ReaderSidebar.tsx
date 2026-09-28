import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { ReactNode } from 'react';
import { Bookmark, GalleryVerticalEnd, TableOfContents } from '@/components/icons';
import { m } from 'motion/react';
import { Tip } from '../../../components/UI';
import { slideFrom } from '../../../lib/motion';
import { useResizablePanel } from '../useResizablePanel';

export type SidebarTab = 'pages' | 'outline' | 'bookmarks' | 'search';

const tabs = [
  ['pages', '页面缩略图', GalleryVerticalEnd],
  ['outline', '文档目录', TableOfContents],
  ['bookmarks', '文档书签', Bookmark],
] as const;
export function ReaderSidebar({
  tab,
  onTab,
  children,
}: {
  tab: SidebarTab;
  onTab: (tab: SidebarTab) => void;
  children: ReactNode;
}) {
  const { width, panel, handleProps } = useResizablePanel<HTMLElement>({
    storageKey: 'leaf-sidebar-width',
    min: 184,
    max: 440,
    initial: 208,
    edge: 'right',
  });
  return (
    <m.aside className="reader-sidebar" ref={panel} style={{ width }} {...slideFrom('left')}>
      {tab !== 'search' && (
        <Tabs
          className="sidebar-tabs"
          value={tab}
          onValueChange={(value) => onTab(value as SidebarTab)}
        >
          <TabsList aria-label="文档导航视图">
            {tabs.map(([value, label, Icon]) => (
              <Tip key={value} label={label} side="bottom">
                <TabsTrigger value={value} aria-label={label}>
                  <Icon size={16} />
                </TabsTrigger>
              </Tip>
            ))}
          </TabsList>
        </Tabs>
      )}
      {children}
      <div {...handleProps} />
    </m.aside>
  );
}
