import { useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { Highlighter, Pencil, Underline } from '@leaf/ui/icons';
import type { MarkColor, MarkKind } from '@leaf/contracts/annotations';
import { fade } from '@leaf/ui/motion';
import { IconButton } from '@leaf/ui/primitives/composition';
import { Palette } from './AnnotationTools';
import { markColorNames } from '@leaf/ui/reading/marks';

const kinds = [
  ['highlight', '高光', Highlighter],
  ['underline', '划线', Underline],
] as const;

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
                label={(value) => markColorNames[value]}
                onChange={(value) => onChange({ color: value })}
              />
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </>
  );
}
