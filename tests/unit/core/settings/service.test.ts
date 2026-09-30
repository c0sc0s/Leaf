import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseSettings } from '../../../../src/core/settings/service';
import { defaultSettings } from '../../../../src/core/settings/service';

const defaults = defaultSettings;

describe('parseSettings', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses defaults when nothing is stored', () => {
    expect(parseSettings(null)).toEqual(defaults);
  });

  it('keeps valid stored preferences', () => {
    const stored = { theme: 'system', readerTheme: 'dark', originalColors: true };
    expect(parseSettings(stored)).toEqual({ ...defaults, ...stored });
  });

  it('replaces unknown values field by field instead of discarding everything', () => {
    const stored = { theme: 'sepia', readerTheme: 'dark', originalColors: 'yes' };
    expect(parseSettings(stored)).toEqual({
      ...defaults,
      readerTheme: 'dark',
    });
  });

  it('recovers from unreadable JSON', () => {
    expect(parseSettings('{not json')).toEqual(defaults);
  });
});
