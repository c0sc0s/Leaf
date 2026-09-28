import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { memo, useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Columns2,
  GalleryVertical,
  RectangleVertical,
} from '@/components/icons';
import type { ReadingLayout } from '../../types';
import { IconButton } from '../../components/UI';
import { pageStep, spreadStart } from '../../lib/layout';

export const ReaderStatus = memo(function ReaderStatus({
  page,
  pages,
  pageLabel,
  layout,
  saveStatus,
  onLayout,
  onNavigate,
}: {
  page: number;
  pages: number;
  pageLabel: string | undefined;
  layout: ReadingLayout;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  onLayout: (layout: ReadingLayout) => void;
  onNavigate: (page: number) => void;
}) {
  const [input, setInput] = useState(String(page));
  useEffect(() => setInput(String(page)), [page]);
  const step = pageStep(layout);
  const commit = () => {
    const target = Math.max(1, Math.min(pages, Number(input) || 1));
    onNavigate(target);
    setInput(String(target));
  };
  return (
    <footer className="reader-status">
      <div className="layout-controls" role="group" aria-label="阅读布局">
        <IconButton
          label="连续滚动"
          active={layout.continuous}
          onClick={() => onLayout({ ...layout, continuous: !layout.continuous })}
        >
          <GalleryVertical size={15} />
        </IconButton>
        <Separator orientation="vertical" className="toolbar-separator" />
        <div className="segmented-icons">
          <IconButton
            label="单页"
            active={!layout.spread}
            onClick={() => layout.spread && onLayout({ ...layout, spread: false })}
          >
            <RectangleVertical size={15} />
          </IconButton>
          <IconButton
            label="双页"
            active={layout.spread}
            onClick={() => !layout.spread && onLayout({ ...layout, spread: true })}
          >
            <Columns2 size={15} />
          </IconButton>
        </div>
      </div>
      <div className="page-controls">
        <IconButton
          label="上一页"
          disabled={spreadStart(page, layout) <= 1}
          onClick={() => onNavigate(page - step)}
        >
          <ChevronLeft size={17} />
        </IconButton>
        <Input
          aria-label="页码"
          type="number"
          min="1"
          max={pages}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
        />
        <span>/ {pages}</span>
        {pageLabel && pageLabel !== String(page) && (
          <span className="printed-page">· 印刷页 {pageLabel}</span>
        )}
        <IconButton
          label="下一页"
          disabled={spreadStart(page, layout) + step > pages}
          onClick={() => onNavigate(page + step)}
        >
          <ChevronRight size={17} />
        </IconButton>
      </div>
      <span className="save-state" aria-live="polite">
        {saveStatus === 'saving'
          ? '保存中…'
          : saveStatus === 'saved'
            ? '已保存'
            : saveStatus === 'error'
              ? '保存失败'
              : ''}
      </span>
    </footer>
  );
});
