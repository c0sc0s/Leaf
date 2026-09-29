import { readPreference, rememberPreference } from '../../../lib/preferences';
import { useEffect, useState } from 'react';
import type { MarkColor } from '../../../types';
import { isMarkColor } from '../../../lib/marks';

const MARK_COLOR_KEY = 'folio-mark-color';

/** The colour new highlights use, remembered across sessions. */
export function useMarkColor() {
  const [color, setColor] = useState<MarkColor>(() => {
    const stored = readPreference(MARK_COLOR_KEY);
    return isMarkColor(stored) ? stored : 'amber';
  });
  useEffect(() => rememberPreference(MARK_COLOR_KEY, color), [color]);
  return [color, setColor] as const;
}
