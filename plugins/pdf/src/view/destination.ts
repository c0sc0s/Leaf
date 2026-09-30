import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { ReadingLocation } from '../types';

export type Destination = string | unknown[] | null;

export async function resolveDestination(
  pdf: PDFDocumentProxy,
  dest: Destination,
): Promise<ReadingLocation | null> {
  const target = typeof dest === 'string' ? await pdf.getDestination(dest) : dest;
  if (!Array.isArray(target)) return null;
  const ref = target[0];
  const page =
    typeof ref === 'object'
      ? (await pdf.getPageIndex(ref as { num: number; gen: number })) + 1
      : Number(ref) + 1;
  const kind = (target[1] as { name?: string } | undefined)?.name;
  const top =
    kind === 'XYZ'
      ? target[3]
      : kind === 'FitH' || kind === 'FitBH'
        ? target[2]
        : kind === 'FitR'
          ? target[5]
          : null;
  if (typeof top !== 'number') return { page, ratio: 0 };
  const viewport = (await pdf.getPage(page)).getViewport({ scale: 1 });
  return {
    page,
    ratio: Math.max(0, viewport.convertToViewportPoint(0, top)[1] / viewport.height),
    screenY: 24,
  };
}
