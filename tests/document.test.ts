import { describe, expect, it } from 'vitest';
import { assessDocument } from '../src/lib/assessment';
import { reconstruct, type RawToken } from '../src/lib/reflow';
import type { PageContent } from '../src/types';
const textPage = (page: number): PageContent =>
  reconstruct(
    [
      {
        text: 'Complete paragraph',
        x: 40,
        y: 40,
        width: 200,
        height: 12,
        fontSize: 12,
        fontName: 'Test',
        originalIndex: 0,
        rect: [40, 40, 240, 52],
      } as RawToken,
    ],
    page,
    600,
  );
describe('whole-document suitability', () => {
  it('rejects a failure on the last page even when all preceding pages succeed', () => {
    const pages = Array.from({ length: 10 }, (_, i) => textPage(i + 1));
    pages[9].issues = [{ page: 10, code: 'scan', message: 'Scan' }];
    expect(assessDocument(pages, 10).suitable).toBe(false);
    expect(assessDocument(pages, 10).issues[0].page).toBe(10);
  });
  it('never accepts a sample of pages as a complete document', () => {
    expect(assessDocument([textPage(1)], 2).suitable).toBe(false);
    expect(assessDocument([textPage(1), textPage(1)], 2).suitable).toBe(false);
    expect(assessDocument([textPage(1), textPage(3)], 2).suitable).toBe(false);
    expect(assessDocument([textPage(2), textPage(1)], 2).suitable).toBe(false);
  });
  it('accepts independent pictures alongside complete body text', () => {
    const page = textPage(1);
    page.blocks.push({
      type: 'figure',
      text: '',
      start: 0,
      end: 0,
      coveredTokens: [],
      image: {
        src: 'data:image/png;base64,image',
        width: 200,
        height: 100,
        kind: 'graphic',
        alt: 'Architecture diagram',
      },
    });
    expect(assessDocument([page, textPage(2)], 2).suitable).toBe(true);
  });
  it('requires every text token and visual asset to enter the content model', () => {
    const missingText = textPage(1);
    missingText.blocks = [];
    expect(assessDocument([missingText], 1).suitable).toBe(false);
    const missingImage = textPage(1);
    missingImage.blocks.push({ type: 'figure', text: '', start: 0, end: 0 });
    expect(assessDocument([missingImage], 1).suitable).toBe(false);
  });
  it('rejects text mutation and duplicated blocks even when their offsets cover every token', () => {
    const mutated = textPage(1);
    mutated.blocks[0].text = 'Lost content';
    expect(assessDocument([mutated], 1).suitable).toBe(false);
    const duplicated = textPage(1);
    duplicated.blocks.push({ ...duplicated.blocks[0] });
    expect(assessDocument([duplicated], 1).suitable).toBe(false);
  });
  it('retains the text contained in a formula or diagram through its figure provenance', () => {
    const page = textPage(1);
    page.blocks = [
      {
        type: 'figure',
        text: '',
        start: 0,
        end: 0,
        coveredTokens: [0],
        image: {
          src: 'data:image/png;base64,image',
          width: 200,
          height: 100,
          kind: 'formula',
          alt: 'Complete paragraph',
        },
      },
    ];
    expect(assessDocument([page], 1).suitable).toBe(true);
  });
});
