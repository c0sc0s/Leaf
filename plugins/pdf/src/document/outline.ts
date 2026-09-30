import type { Locator, OutlineEntry } from '@leaf/contracts/documents';
import { locatorPayload } from '@leaf/contracts/documents';

export function activeOutlineId(
  locator: Locator,
  entries: OutlineEntry[],
  preferredId?: string | null,
): string | null {
  const position = (target: Locator) => {
    const payload = locatorPayload(target);
    return Number(payload.page) + (Number(payload.ratio) || 0);
  };
  // Select a heading once it reaches the top portion of the visible page.
  const current = position(locator) + 0.08;
  let active: OutlineEntry | undefined;
  for (const entry of entries)
    if (
      position(entry.locator) <= current &&
      (!active || position(entry.locator) >= position(active.locator))
    )
      active = entry;
  const preferred = entries.find((entry) => entry.id === preferredId);
  if (active && preferred && position(preferred.locator) === position(active.locator))
    return preferred.id;
  return active?.id ?? null;
}
