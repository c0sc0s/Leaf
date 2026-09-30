import { it, expect } from 'vitest';
import { PDFDocument, PDFName, PDFArray, PDFDict } from 'pdf-lib';
import { exportAnnotated, notesMarkdown } from '../src/lib/export';
import type { Annotation } from '../src/types';
it('exports native markup annotations without altering the original', async () => {
  const original = await PDFDocument.create();
  original.addPage([595, 842]);
  const bytes = await original.save();
  const mark: Annotation = {
    id: 'example',
    bookId: 'book',
    page: 1,
    start: 0,
    end: 5,
    quote: 'Hello',
    kind: 'highlight',
    color: 'amber',
    note: '中文笔记',
    rects: [[10, 20, 40, 35]],
    createdAt: 0,
    source: 'text',
  };
  const result = await exportAnnotated(new Blob([bytes.slice().buffer]), [
    mark,
    { ...mark, id: 'underline', kind: 'underline' },
  ]);
  const doc = await PDFDocument.load(result);
  const arr = doc.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray);
  expect(arr.size()).toBe(2);
  const first = arr.lookup(0, PDFDict);
  expect(first.lookup(PDFName.of('Subtype'))!.toString()).toBe('/Highlight');
  expect(
    first
      .lookup(PDFName.of('QuadPoints'), PDFArray)
      .asArray()
      .map((v) => v.toString()),
  ).toEqual(['10', '35', '40', '35', '10', '20', '40', '20']);
  expect(doc.getPage(0).getWidth()).toBe(595);
  expect((await PDFDocument.load(bytes)).getPage(0).node.get(PDFName.of('Annots'))).toBeUndefined();
  expect(notesMarkdown('Book', [mark])).toContain('中文笔记');
});
