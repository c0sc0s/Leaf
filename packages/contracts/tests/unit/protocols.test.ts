import { describe, expect, it } from 'vitest';
import { compatibleVersion, type PluginManifest } from '../../src/plugins';
import type { Annotation } from '../../src/annotations';
import type { Locator } from '../../src/documents';
import {
  annotation,
  locator,
  manifest,
  position,
  resourcePath,
} from '../../src/transport/validation';

const plugin: PluginManifest = {
  id: 'example.text',
  name: 'Text',
  description: 'Text reader',
  version: '1.0.0',
  hostApi: '^1.0.0',
  entries: { renderer: 'renderer.js' },
  contributes: { documentProviders: ['example.text.document'], views: ['example.text.view'] },
  permissions: ['documents'],
  dependencies: {},
};
const anchor: Locator = {
  documentId: 'document',
  revision: 'r1',
  schema: 'example.text',
  version: 1,
  payload: { section: 'intro', offset: 10 },
};

describe('plugin protocol', () => {
  it.each([
    ['1.2.3', '^1.0.0', true],
    ['2.0.0', '^1.0.0', false],
    ['0.1.9', '^0.1.2', true],
    ['0.2.0', '^0.1.2', false],
    ['0.0.3', '^0.0.2', false],
    ['1.2.4', '~1.2.3', true],
    ['1.3.0', '~1.2.3', false],
    ['1.0.0', '>=1.0.0', false],
  ])('checks %s against %s', (version, range, expected) => {
    expect(compatibleVersion(version, range)).toBe(expected);
  });

  it('accepts declared capabilities and rejects incompatible or ambiguous declarations', () => {
    expect(manifest(plugin)).toEqual(plugin);
    for (const changes of [
      { hostApi: '^2.0.0' },
      { entries: { renderer: '../renderer.js' } },
      { contributes: { panels: ['duplicate', 'duplicate'] } },
      { contributes: { commands: ['obsolete'] } },
      { dependencies: { 'example.text': '^1.0.0' } },
    ])
      expect(() => manifest({ ...plugin, ...changes })).toThrow();
  });
});

describe('document protocol', () => {
  it('preserves opaque format locations and rejects foreign identities and non-JSON payloads', () => {
    expect(locator(anchor, 'document', 'r1')).toEqual(anchor);
    expect(() => locator(anchor, 'another-document', 'r1')).toThrow();
    expect(() => locator(anchor, 'document', 'r2')).toThrow();
    expect(() => locator({ ...anchor, version: 0 })).toThrow();
    expect(() => locator({ ...anchor, payload: { offset: Infinity } })).toThrow();
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => locator({ ...anchor, payload: circular })).toThrow();
  });

  it('keeps every annotation target tied to the same document revision', () => {
    const mark: Annotation = {
      id: 'mark',
      documentId: 'document',
      targets: [anchor, { ...anchor, payload: 'ending' }],
      quote: 'Selected text',
      kind: 'underline',
      color: 'green',
      note: '',
      createdAt: 1,
    };
    expect(annotation(mark, 'document', 'r1')).toEqual(mark);
    expect(() => annotation({ ...mark, targets: [] }, 'document', 'r1')).toThrow();
    expect(() =>
      annotation({ ...mark, targets: [anchor, { ...anchor, revision: 'r2' }] }, 'document', 'r1'),
    ).toThrow();
    expect(
      position(
        { locator: anchor, settings: { layout: 'continuous' }, viewport: { ratio: 0.4 } },
        'document',
        'r1',
      ).viewport.ratio,
    ).toBe(0.4);
  });

  it('uses document-relative resource paths independent of the operating system', () => {
    expect(resourcePath('chapters/intro.md')).toBe('chapters/intro.md');
    for (const path of ['../outside', '/absolute', 'a//b', 'a/./b', 'a\\b', 'C:/outside'])
      expect(() => resourcePath(path)).toThrow();
  });
});
