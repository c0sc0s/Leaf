import { Separator } from '@leaf/ui/primitives/separator';
import { Button } from '@leaf/ui/primitives/button';
import { useState } from 'react';
import { Copy, Highlighter, Underline, StickyNote, X, ChevronDown, Trash2 } from '@leaf/ui/icons';
import type { Annotation, MarkColor, MarkKind } from '@leaf/contracts/annotations';
import type { ReactNode } from 'react';
import type { ScreenPoint } from '@leaf/contracts/reader';
import { markColors } from '@leaf/ui/reading/marks';
import { IconButton } from '@leaf/ui/primitives/composition';
import { m } from 'motion/react';
import { pop } from '@leaf/ui/motion';
export function Palette({
  color,
  label = (c) => `${c} 批注颜色`,
  onChange,
}: {
  color: MarkColor;
  label?: (color: MarkColor) => string;
  onChange: (color: MarkColor) => void;
}) {
  return (
    <div className="mark-colors">
      {(Object.keys(markColors) as MarkColor[]).map((c) => (
        <Button
          variant="ghost"
          key={c}
          aria-label={label(c)}
          aria-pressed={c === color}
          style={{ background: markColors[c] }}
          className={c === color ? 'selected' : ''}
          onClick={() => onChange(c)}
        />
      ))}
    </div>
  );
}
export function SelectionTools({
  point,
  annotations = true,
  color,
  onColor,
  onAnnotate,
  onCopy,
  extensions,
  onClose,
}: {
  point: ScreenPoint;
  annotations?: boolean;
  color: MarkColor;
  onColor: (color: MarkColor) => void;
  onAnnotate: (kind: MarkKind, note?: boolean) => void;
  onCopy: () => void;
  extensions?: ReactNode;
  onClose: () => void;
}) {
  const [palette, setPalette] = useState(false);
  return (
    <m.div
      {...pop}
      className="selection-toolbar"
      role="toolbar"
      aria-label="选中文字操作"
      style={{ left: point.x, top: point.y }}
      onPointerDown={(e) => e.preventDefault()}
    >
      <IconButton label="复制文字" onClick={onCopy}>
        <Copy size={17} />
      </IconButton>
      {annotations && (
        <>
          <IconButton label="高光标注" onClick={() => onAnnotate('highlight')}>
            <Highlighter size={18} style={{ color: markColors[color] }} />
          </IconButton>
          <IconButton label="选择高光颜色" active={palette} onClick={() => setPalette(!palette)}>
            <ChevronDown size={13} />
          </IconButton>
          <IconButton label="写笔记" onClick={() => onAnnotate('highlight', true)}>
            <StickyNote size={17} />
          </IconButton>
          <IconButton label="划线标注" onClick={() => onAnnotate('underline')}>
            <Underline size={18} />
          </IconButton>
        </>
      )}
      {extensions}
      <IconButton label="关闭标注工具" onClick={onClose}>
        <X size={15} />
      </IconButton>
      {palette && (
        <div className="palette-popover">
          <Palette
            color={color}
            onChange={(c) => {
              onColor(c);
              setPalette(false);
            }}
          />
        </div>
      )}
    </m.div>
  );
}
export function MarkTools({
  mark,
  position,
  onColor,
  onNote,
  onDelete,
  onClose,
}: {
  mark: Annotation;
  position: { x: number; y: number };
  onColor: (color: MarkColor) => void;
  onNote: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <m.div
      {...pop}
      className="annotation-popover selection-toolbar"
      role="toolbar"
      aria-label="编辑批注"
      style={{ left: position.x, top: position.y }}
      onPointerDown={(e) => e.preventDefault()}
    >
      <Palette color={mark.color} onChange={onColor} />
      <Separator orientation="vertical" className="toolbar-separator" />
      <IconButton label="编辑这条笔记" onClick={onNote}>
        <StickyNote size={17} />
      </IconButton>
      <IconButton label="删除这条批注" onClick={onDelete}>
        <Trash2 size={17} />
      </IconButton>
      <IconButton label="关闭批注菜单" onClick={onClose}>
        <X size={15} />
      </IconButton>
    </m.div>
  );
}
