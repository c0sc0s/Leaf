import { PDFDocument, PDFName, PDFArray, PDFHexString, PDFString } from 'pdf-lib';
import type { Annotation } from '../types';
export const colors = { amber: '#e9b84d', green: '#72b49a', blue: '#79a7dc', pink: '#d994ad' };
export async function exportAnnotated(blob: Blob, marks: Annotation[]) {
  const doc = await PDFDocument.load(await blob.arrayBuffer());
  for (const mark of marks) {
    if (!mark.rects.length) continue;
    const page = doc.getPage(mark.page - 1);
    const hex = colors[mark.color].slice(1);
    const color = [0, 2, 4].map((n) => parseInt(hex.slice(n, n + 2), 16) / 255);
    const rect = [
      Math.min(...mark.rects.map((r) => r[0])),
      Math.min(...mark.rects.map((r) => r[1])),
      Math.max(...mark.rects.map((r) => r[2])),
      Math.max(...mark.rects.map((r) => r[3])),
    ];
    const annotation = doc.context.obj({
      Type: 'Annot',
      Subtype: mark.kind === 'highlight' ? 'Highlight' : 'Underline',
      Rect: rect,
      QuadPoints: mark.rects.flatMap(([x1, y1, x2, y2]) => [x1, y2, x2, y2, x1, y1, x2, y1]),
      C: color,
      CA: 0.45,
      F: 4,
      T: PDFHexString.fromText('Folio'),
      Contents: PDFHexString.fromText(mark.note || mark.quote),
      NM: PDFString.of(mark.id),
      M: PDFString.of(
        'D:' + new Date(mark.createdAt).toISOString().replace(/[-:T]/g, '').slice(0, 14) + 'Z',
      ),
    });
    let annots = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
    if (!annots) {
      annots = doc.context.obj([]);
      page.node.set(PDFName.of('Annots'), annots);
    }
    annots.push(doc.context.register(annotation));
  }
  return doc.save();
}
export async function saveFile(name: string, data: Uint8Array, mime = 'application/pdf') {
  if (window.desktop) return window.desktop.saveFile(name, data);
  const url = URL.createObjectURL(new Blob([data.slice().buffer], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
export function notesMarkdown(title: string, marks: Annotation[]) {
  return (
    `# ${title}\n\n` +
    marks
      .sort((a, b) => a.page - b.page || a.start - b.start || a.createdAt - b.createdAt)
      .map(
        (m) =>
          `## 第 ${m.page} 页 · ${m.kind === 'highlight' ? '高光' : '划线'}\n\n> ${m.quote.replace(/\n/g, '\n> ')}\n\n${m.note || ''}\n`,
      )
      .join('\n')
  );
}
