import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseSettings } from '../src/features/settings/useSettings';
import { defaultSettings } from '../src/lib/appearance';

const defaults = defaultSettings;

describe('parseSettings', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses defaults when nothing is stored', () => {
    expect(parseSettings(null)).toEqual(defaults);
  });

  it('keeps valid stored preferences', () => {
    const stored = { theme: 'system', readerTheme: 'dark', originalColors: true };
    expect(parseSettings(JSON.stringify(stored))).toEqual({ ...defaults, ...stored });
  });

  it('replaces unknown values field by field instead of discarding everything', () => {
    const stored = { theme: 'sepia', readerTheme: 'dark', originalColors: 'yes' };
    expect(parseSettings(JSON.stringify(stored))).toEqual({
      ...defaults,
      readerTheme: 'dark',
    });
  });

  it('recovers from unreadable JSON', () => {
    expect(parseSettings('{not json')).toEqual(defaults);
  });
});
