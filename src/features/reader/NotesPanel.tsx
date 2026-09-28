import { EmptyState } from '@/components/Mascot';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { memo, useEffect, useMemo, useRef } from 'react';
import { Trash2, X } from '@/components/icons';
import { m } from 'motion/react';
import type { Annotation, MarkColor, MarkKind, ReadingLocation } from '../../types';
import { colors } from '../../lib/export';
import { slideFrom } from '../../lib/motion';
import { IconButton } from '../../components/UI';
import { NoteEditor } from './NoteEditor';
import { NoteStyle } from './NoteStyle';
import { useResizablePanel } from './useResizablePanel';
import { revealIn } from '../../lib/reveal';

export const NotesPanel = memo(function NotesPanel({
  marks,
  page,
  activeId,
  onNote,
  onStyle,
  onRemove,
  onNavigate,
  onClose,
}: {
  marks: Annotation[];
  page: number;
  activeId: string | null;
  onNote: (id: string, text: string) => Promise<void>;
  onStyle: (id: string, changes: { kind?: MarkKind; color?: MarkColor }) => void;
  onRemove: (mark: Annotation) => void;
  onNavigate: (page: number, location?: ReadingLocation) => void;
  onClose: () => void;
}) {
  const sorted = useMemo(
    () =>
      [...marks].sort((a, b) => a.page - b.page || a.start - b.start || a.createdAt - b.createdAt),
    [marks],
  );
  const { width, panel, handleProps } = useResizablePanel<HTMLElement>({
    storageKey: 'leaf-notes-width',
    min: 260,
    max: 520,
    initial: 300,
    edge: 'left',
  });
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = list.current;
    const card = activeId && box?.querySelector(`[data-mark-card="${activeId}"]`);
    if (box && card) revealIn(box, card, 'smooth');
  }, [activeId]);
  return (
    <m.aside className="notes-panel" ref={panel} style={{ width }} {...slideFrom('right')}>
      <div {...handleProps} />
      <div className="notes-heading">
        <h3>
          阅读笔记 <span>{marks.length}</span>
        </h3>
        <IconButton label="关闭笔记" onClick={onClose}>
          <X size={16} />
        </IconButton>
      </div>
      <div className="notes-list" ref={list}>
        {sorted.map((mark) => (
          <Card
            size="sm"
            className={`note-card ${mark.page === page ? 'current-page' : ''} ${mark.id === activeId ? 'active' : ''}`}
            data-mark-card={mark.id}
            key={mark.id}
          >
            <div className="note-card-top">
              <Button
                variant="ghost"
                className="note-page"
                onClick={() =>
                  onNavigate(mark.page, {
                    page: mark.page,
                    ratio: 0,
                    offset: mark.start,
                    screenY: 32,
                  })
                }
              >
                第 {mark.page} 页
              </Button>
              <IconButton label="删除这条批注" onClick={() => onRemove(mark)}>
                <Trash2 size={13} />
              </IconButton>
            </div>
            <blockquote style={{ borderColor: colors[mark.color] }}>{mark.quote}</blockquote>
            <NoteEditor mark={mark} save={onNote} />
            <div className="note-format">
              <NoteStyle
                kind={mark.kind}
                color={mark.color}
                onChange={(changes) => onStyle(mark.id, changes)}
              />
              <span className="note-date">
                {new Date(mark.createdAt).toLocaleDateString('zh-CN')}
              </span>
            </div>
          </Card>
        ))}
        {!marks.length && <EmptyState scene="notes" compact />}
      </div>
    </m.aside>
  );
});
