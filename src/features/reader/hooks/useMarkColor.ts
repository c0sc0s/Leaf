import { useEffect, useState } from 'react';
import type { MarkColor } from '../../../types';
import { isMarkColor } from '../../../lib/marks';

const MARK_COLOR_KEY = 'folio-mark-color';

/** The colour new highlights use, remembered across sessions. */
export function useMarkColor() {
  const [color, setColor] = useState<MarkColor>(() => {
    const stored = localStorage.getItem(MARK_COLOR_KEY);
    return isMarkColor(stored) ? stored : 'amber';
  });
  useEffect(() => localStorage.setItem(MARK_COLOR_KEY, color), [color]);
  return [color, setColor] as const;
}
