import { EmptyState } from '../components/Mascot';
import { Card } from '@leaf/ui/primitives/card';
import { Button } from '@leaf/ui/primitives/button';
import { useEffect, useMemo, useRef } from 'react';
import { Trash2, X } from '@leaf/ui/icons';
import { ReaderPanel } from '@leaf/ui/reading/ReaderPanel';
import type { Annotation, MarkColor, MarkKind } from '@leaf/contracts/annotations';
import type { DocumentHandle, Locator } from '@leaf/contracts/documents';
import { markColors } from '@leaf/ui/reading/marks';
import { IconButton } from '@leaf/ui/primitives/composition';
import { NoteEditor } from './NoteEditor';
import { NoteStyle } from './NoteStyle';
import { useResizablePanel } from '@leaf/ui/hooks/useResizablePanel';
import { revealIn } from '@leaf/ui/reading/reveal';
import type { PersistenceCoordinator } from '../../platform/transport/persistence';

export function NotesPanel({
  marks,
  document,
  activeId,
  focusId,
  onFocused,
  onNote,
  onStyle,
  onRemove,
  onNavigate,
  onClose,
  persistence,
  notify,
}: {
  marks: Annotation[];
  document: DocumentHandle;
  activeId: string | null;
  focusId: string | null;
  onFocused(): void;
  onNote(id: string, text: string): Promise<void>;
  onStyle(id: string, changes: { kind?: MarkKind; color?: MarkColor }): void;
  onRemove(mark: Annotation): void;
  onNavigate(locator: Locator): void;
  onClose(): void;
  persistence: PersistenceCoordinator;
  notify(message: string): void;
}) {
  const sorted = useMemo(
    () =>
      [...marks].sort(
        (a, b) =>
          (document.navigation?.index(a.targets[0]) ?? 0) -
            (document.navigation?.index(b.targets[0]) ?? 0) || a.createdAt - b.createdAt,
      ),
    [marks, document],
  );
  const { width, panel, handleProps } = useResizablePanel<HTMLElement>({
    storageKey: 'notes-width',
    min: 260,
    max: 520,
    initial: 300,
    edge: 'left',
  });
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!focusId || !list.current) return;
    const input = list.current.querySelector<HTMLTextAreaElement>(
      `[data-note-id="${CSS.escape(focusId)}"]`,
    );
    if (input) {
      input.focus({ preventScroll: true });
      revealIn(list.current, input);
      onFocused();
    }
  }, [focusId, onFocused, marks]);
  useEffect(() => {
    const box = list.current,
      card = activeId && box?.querySelector(`[data-mark-card="${CSS.escape(activeId)}"]`);
    if (box && card) revealIn(box, card, 'smooth');
  }, [activeId]);
  return (
    <ReaderPanel ref={panel} style={{ width }}>
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
            className={`note-card ${mark.id === activeId ? 'active' : ''}`}
            data-mark-card={mark.id}
            key={mark.id}
          >
            <div className="note-card-top">
              <Button
                variant="ghost"
                className="note-page"
                onClick={() => onNavigate(mark.targets[0])}
              >
                {document.locators.label(mark.targets[0])}
              </Button>
              <IconButton label="删除这条批注" onClick={() => onRemove(mark)}>
                <Trash2 size={13} />
              </IconButton>
            </div>
            <blockquote style={{ borderColor: markColors[mark.color] }}>{mark.quote}</blockquote>
            <NoteEditor
              mark={mark}
              label={document.locators.label(mark.targets[0])}
              save={onNote}
              persistence={persistence}
              notify={notify}
            />
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
    </ReaderPanel>
  );
}
