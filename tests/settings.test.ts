import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseSettings } from '../src/features/settings/useSettings';

const defaults = { theme: 'light', readerTheme: 'follow', originalColors: false };

describe('parseSettings', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses defaults when nothing is stored', () => {
    expect(parseSettings(null)).toEqual(defaults);
  });

  it('keeps valid stored preferences', () => {
    const stored = { theme: 'system', readerTheme: 'dark', originalColors: true };
    expect(parseSettings(JSON.stringify(stored))).toEqual(stored);
  });

  it('replaces unknown values field by field instead of discarding everything', () => {
    const stored = { theme: 'sepia', readerTheme: 'dark', originalColors: 'yes' };
    expect(parseSettings(JSON.stringify(stored))).toEqual({
      ...defaults,
      readerTheme: 'dark',
    });
  });

  it('clears unreadable JSON so it is not parsed again', () => {
    const removeItem = vi.fn();
    vi.stubGlobal('localStorage', { removeItem });
    expect(parseSettings('{not json')).toEqual(defaults);
    expect(removeItem).toHaveBeenCalledWith('folio-settings');
  });
});
