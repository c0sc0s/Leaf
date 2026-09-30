import type { DocumentMetadata, Locator } from '@leaf/contracts/documents';
import { belongsToDocument, locatorPayload } from '@leaf/contracts/documents';
import type { Annotation } from '@leaf/contracts/annotations';
import type { ReadingLocation, RenderedMark } from '../types';

export function pdfLocator(
  metadata: DocumentMetadata,
  location: Pick<ReadingLocation, 'page'> &
    Partial<ReadingLocation> & { end?: number; rects?: number[][] },
): Locator {
  const payload: Record<string, number | number[][]> = { page: location.page };
  if (location.ratio !== undefined) payload.ratio = location.ratio;
  if (location.offset !== undefined) payload.offset = location.offset;
  if (location.end !== undefined) payload.end = location.end;
  if (location.rects !== undefined) payload.rects = location.rects;
  return {
    documentId: metadata.id,
    revision: metadata.revision,
    schema: 'leaf.pdf',
    version: 1,
    payload,
  };
}
export function validPDFLocator(locator: Locator, metadata: DocumentMetadata, pages: number) {
  if (
    !belongsToDocument(locator, metadata) ||
    locator.schema !== 'leaf.pdf' ||
    locator.version !== 1
  )
    return false;
  try {
    const payload = locatorPayload(locator);
    return (
      Number.isInteger(payload.page) &&
      Number(payload.page) >= 1 &&
      Number(payload.page) <= pages &&
      (payload.ratio === undefined ||
        (typeof payload.ratio === 'number' && payload.ratio >= 0 && payload.ratio <= 1)) &&
      (payload.offset === undefined ||
        (Number.isInteger(payload.offset) && Number(payload.offset) >= 0)) &&
      (payload.end === undefined ||
        (Number.isInteger(payload.end) && Number(payload.end) >= Number(payload.offset ?? 0))) &&
      (payload.rects === undefined ||
        (Array.isArray(payload.rects) &&
          payload.rects.every(
            (rect) =>
              Array.isArray(rect) &&
              rect.length === 4 &&
              rect.every(
                (coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate),
              ),
          )))
    );
  } catch {
    return false;
  }
}
export function pdfLocation(locator: Locator): ReadingLocation {
  const payload = locatorPayload(locator);
  return {
    page: Number(payload.page),
    ratio: Number(payload.ratio) || 0,
    ...(payload.offset === undefined ? {} : { offset: Number(payload.offset) }),
  };
}
export function renderedMarks(
  annotations: Annotation[],
  metadata: DocumentMetadata,
  pages: number,
): RenderedMark[] {
  return annotations.flatMap((annotation) =>
    annotation.targets
      .filter((locator) => validPDFLocator(locator, metadata, pages))
      .map((locator) => {
        const payload = locatorPayload(locator);
        return {
          id: annotation.id,
          page: Number(payload.page),
          start: Number(payload.offset ?? 0),
          end: Number(payload.end ?? payload.offset ?? 0),
          rects: (payload.rects ?? []) as number[][],
          quote: annotation.quote,
          kind: annotation.kind,
          color: annotation.color,
          note: annotation.note,
          createdAt: annotation.createdAt,
        };
      }),
  );
}
