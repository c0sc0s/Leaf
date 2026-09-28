import { useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { Highlighter, Pencil, Underline } from '@/components/icons';
import type { MarkColor, MarkKind } from '../../types';
import { fade } from '../../lib/motion';
import { IconButton } from '../../components/UI';
import { Palette } from './AnnotationTools';

const kinds = [
  ['highlight', '高光', Highlighter],
  ['underline', '划线', Underline],
] as const;
const colorNames: Record<MarkColor, string> = {
  amber: '黄色',
  green: '绿色',
  blue: '蓝色',
  pink: '粉色',
};

export function NoteStyle({
  kind,
  color,
  onChange,
}: {
  kind: MarkKind;
  color: MarkColor;
  onChange: (changes: { kind?: MarkKind; color?: MarkColor }) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton label="编辑批注" active={open} onClick={() => setOpen(!open)}>
        <Pencil size={15} />
      </IconButton>
      <AnimatePresence initial={false}>
        {open && (
          <m.div className="note-style-options" {...fade}>
            <div className="note-kinds" role="group" aria-label="批注类型">
              {kinds.map(([value, label, Icon]) => (
                <IconButton
                  key={value}
                  label={label}
                  active={kind === value}
                  onClick={() => onChange({ kind: value })}
                >
                  <Icon size={14} />
                </IconButton>
              ))}
            </div>
            <div role="group" aria-label="批注颜色">
              <Palette
                color={color}
                label={(value) => colorNames[value]}
                onChange={(value) => onChange({ color: value })}
              />
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </>
  );
}
