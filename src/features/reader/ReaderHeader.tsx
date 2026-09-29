import { Button } from '@/components/ui/button';
import { memo } from 'react';
import {
  ArrowLeft,
  History,
  Maximize,
  Minimize,
  Minus,
  MoreHorizontal,
  NotebookPen,
  PanelLeft,
  Plus,
  Search,
} from '@/components/icons';
import * as Menu from '@/components/ui/dropdown-menu';
import { IconButton } from '../../components/UI';
import { BookmarkToggle } from './BookmarkToggle';
import { MAX_ZOOM, MIN_ZOOM } from './zoom';

const mac = window.desktop?.platform === 'darwin';

export const ReaderHeader = memo(function ReaderHeader({
  title,
  author,
  navigationOpen,
  searchOpen,
  notesOpen,
  focus,
  bookmarked,
  canReturn,
  zoom,
  exporting,
  continuousHighlight,
  onBack,
  onToggleNavigation,
  onToggleSearch,
  onReturn,
  onToggleBookmark,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onToggleNotes,
  onToggleFocus,
  onExportPDF,
  onExportNotes,
  onContinuousHighlight,
  onSettings,
}: {
  title: string;
  author: string;
  navigationOpen: boolean;
  searchOpen: boolean;
  notesOpen: boolean;
  focus: boolean;
  bookmarked: boolean;
  canReturn: boolean;
  zoom: number;
  exporting: boolean;
  continuousHighlight: boolean;
  onBack: () => void;
  onToggleNavigation: () => void;
  onToggleSearch: () => void;
  onReturn: () => void;
  onToggleBookmark: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onToggleNotes: () => void;
  onToggleFocus: () => void;
  onExportPDF: () => void;
  onExportNotes: () => void;
  onContinuousHighlight: (value: boolean) => void;
  onSettings: () => void;
}) {
  return (
    <header
      className={`reader-header ${mac ? 'native-mac' : window.desktop?.platform === 'win32' ? 'native-win' : ''}`}
    >
      <div className="reader-header-start">
        <IconButton label="返回书架" onClick={onBack}>
          <ArrowLeft size={18} />
        </IconButton>
        <div className="tool-group reader-navigation">
          <IconButton label="文档导航" active={navigationOpen} onClick={onToggleNavigation}>
            <PanelLeft size={18} />
          </IconButton>
          <IconButton
            label="搜索 PDF"
            shortcut={mac ? '⌘F' : 'Ctrl+F'}
            active={searchOpen}
            onClick={onToggleSearch}
          >
            <Search size={17} />
          </IconButton>
          <IconButton label="返回刚才的位置" disabled={!canReturn} onClick={onReturn}>
            <History size={17} />
          </IconButton>
        </div>
      </div>
      <div className="reader-title" title={`${title} · ${author}`}>
        <strong>{title}</strong>
      </div>
      <div className="reader-header-end">
        <div className="tool-group reader-zoom">
          <IconButton
            label="缩小"
            shortcut={mac ? '⌘-' : 'Ctrl+-'}
            disabled={zoom <= MIN_ZOOM}
            onClick={onZoomOut}
          >
            <Minus size={15} />
          </IconButton>
          <Button variant="ghost" className="zoom-label" onClick={onResetZoom} title="适应宽度">
            {Math.round(zoom * 100)}%
          </Button>
          <IconButton
            label="放大"
            shortcut={mac ? '⌘+' : 'Ctrl++'}
            disabled={zoom >= MAX_ZOOM}
            onClick={onZoomIn}
          >
            <Plus size={15} />
          </IconButton>
        </div>
        <div className="tool-group reader-actions">
          <BookmarkToggle bookmarked={bookmarked} onToggle={onToggleBookmark} />
          <IconButton label="阅读笔记" active={notesOpen} onClick={onToggleNotes}>
            <NotebookPen size={18} />
          </IconButton>
          <Menu.DropdownMenu>
            <Menu.DropdownMenuTrigger asChild>
              <Button variant="ghost" className="icon-button" aria-label="更多阅读操作">
                <MoreHorizontal size={18} />
              </Button>
            </Menu.DropdownMenuTrigger>

            <Menu.DropdownMenuContent align="end" sideOffset={6}>
              <Menu.DropdownMenuItem disabled={exporting} onSelect={onExportPDF}>
                导出批注 PDF
              </Menu.DropdownMenuItem>
              <Menu.DropdownMenuItem onSelect={onExportNotes}>
                导出 Markdown 笔记
              </Menu.DropdownMenuItem>
              <Menu.DropdownMenuCheckboxItem
                checked={continuousHighlight}
                onCheckedChange={onContinuousHighlight}
              >
                连续高亮
              </Menu.DropdownMenuCheckboxItem>
              <Menu.DropdownMenuSeparator />
              <Menu.DropdownMenuItem onSelect={onSettings}>阅读偏好</Menu.DropdownMenuItem>
            </Menu.DropdownMenuContent>
          </Menu.DropdownMenu>
          <IconButton
            label={focus ? '退出专注阅读' : '专注阅读（F）'}
            active={focus}
            onClick={onToggleFocus}
          >
            {focus ? <Minimize size={17} /> : <Maximize size={17} />}
          </IconButton>
        </div>
      </div>
    </header>
  );
});
