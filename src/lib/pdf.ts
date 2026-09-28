import { getDocument, GlobalWorkerOptions, Util } from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { indexText, type RawToken, type Structure } from './text';
import type { Book, PageContent } from '../types';
import { fingerprint } from './db';
GlobalWorkerOptions.workerSrc = workerUrl;
const vendorBase = new URL('./vendor/', document.baseURI).href;
export function loadPDF(
  data: ArrayBuffer,
  onPassword?: (update: (password: string) => void, reason: number) => void,
) {
  const task = getDocument({
    data: new Uint8Array(data),
    cMapUrl: vendorBase + 'cmaps/',
    cMapPacked: true,
    standardFontDataUrl: vendorBase + 'standard_fonts/',
    wasmUrl: vendorBase + 'wasm/',
  });
  if (onPassword) task.onPassword = onPassword;
  return task;
}
export async function extractPage(pdf: PDFDocumentProxy, number: number): Promise<PageContent> {
  const page = await pdf.getPage(number);
  const viewport = page.getViewport({ scale: 1 });
  const [content, tree] = await Promise.all([
    page.getTextContent({ includeMarkedContent: true }),
    page.getStructTree(),
  ]);
  let markedId: string | undefined;
  const markedStack: (string | undefined)[] = [];
  const raw: RawToken[] = [];
  let originalIndex = 0;
  for (const item of content.items) {
    if (!('str' in item)) {
      if (item.type === 'beginMarkedContentProps' || item.type === 'beginMarkedContent') {
        markedStack.push(markedId);
        if (item.type === 'beginMarkedContentProps') markedId = item.id;
      } else if (item.type === 'endMarkedContent') markedId = markedStack.pop();
      continue;
    }
    const tx = Util.transform(viewport.transform, item.transform);
    const height = Math.hypot(tx[2], tx[3]) || item.height || 12;
    const width = item.width * Math.hypot(viewport.transform[0], viewport.transform[1]);
    const style = content.styles[item.fontName];
    const ascent = style?.ascent ?? (style?.descent ? 1 + style.descent : 0.8);
    const top = tx[5] - height * ascent;
    const p1 = viewport.convertToPdfPoint(tx[4], top + height),
      p2 = viewport.convertToPdfPoint(tx[4] + width, top);
    raw.push({
      text: item.str,
      x: tx[4],
      y: top,
      baseline: tx[5],
      width,
      height,
      fontSize: height,
      fontName: item.fontName,
      rect: [
        Math.min(p1[0], p2[0]),
        Math.min(p1[1], p2[1]),
        Math.max(p1[0], p2[0]),
        Math.max(p1[1], p2[1]),
      ],
      originalIndex: originalIndex++,
      markedId,
    });
  }
  const result = indexText(raw, number, viewport.width, tree as Structure | null);
  result.width = viewport.width;
  result.height = viewport.height;
  return result;
}
export async function importPDF(blob: Blob, filename: string, password?: string): Promise<Book> {
  const data = await blob.arrayBuffer();
  const id = await fingerprint(data);
  const task = loadPDF(data, password ? (update) => update(password) : undefined);
  try {
    const pdf = await task.promise;
    const metadata = await pdf.getMetadata();
    const info = metadata.info as { Title?: string; Author?: string };
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 240 / page.getViewport({ scale: 1 }).width });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvas, viewport }).promise;
    return {
      id,
      title: info.Title?.trim() || filename.replace(/\.pdf$/i, ''),
      author: info.Author?.trim() || '未知作者',
      filename,
      pages: pdf.numPages,
      blob,
      cover: canvas.toDataURL('image/webp', 0.85),
      addedAt: Date.now(),
      openedAt: 0,
      page: 1,
      favorite: false,
      category: '未分类',
    };
  } finally {
    await task.destroy();
  }
}
