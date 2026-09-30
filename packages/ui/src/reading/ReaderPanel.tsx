import type { ComponentProps } from 'react';
import { m } from 'motion/react';
import { slideFrom } from '../motion';
import { cn } from '../utils';
import './panels.css';

export function ReaderPanel({ className, ...props }: ComponentProps<typeof m.aside>) {
  return <m.aside {...slideFrom('right')} {...props} className={cn('notes-panel', className)} />;
}
