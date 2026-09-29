import type { Book, BookMetadata, Annotation, MarkdownChapter } from '../types';
import { bookMetadata } from './bookData';
import { storageRequest, trackStorage } from './storageClient';
import { forgetPreference } from './preferences';

export interface ContentReference {
  hash: string;
  size: number;
  type: string;
  token?: string;
}
export interface StoredBook {
  metadata: BookMetadata;
  content: {
    blob: ContentReference;
    chapters?: MarkdownChapter[];
    assets?: { path: string; blob: ContentReference }[];
  };
}
const chunkSize = 1024 * 1024;
function encode(bytes: Uint8Array) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(binary);
}
export async function uploadBlob(blob: Blob): Promise<ContentReference> {
  const token = await storageRequest<string>('beginBlob', { size: blob.size, type: blob.type });
  try {
    for (let offset = 0; offset < blob.size; offset += chunkSize) {
      const data = encode(
        new Uint8Array(await blob.slice(offset, offset + chunkSize).arrayBuffer()),
      );
      await storageRequest('appendBlob', { token, offset, data });
    }
    return await storageRequest<ContentReference>('finishBlob', token);
  } catch (error) {
    await storageRequest('abortBlob', token).catch(() => {});
    throw error;
  }
}
async function readBlob(reference: ContentReference, token: string) {
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  for (let offset = 0; offset < reference.size; offset += chunkSize) {
    const data = await storageRequest<string>('readBlob', { hash: reference.hash, token, offset });
    const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
    if (bytes.length !== Math.min(chunkSize, reference.size - offset))
      throw new Error('书籍内容读取不完整');
    chunks.push(bytes);
  }
  return new Blob(chunks, { type: reference.type });
}
export async function stageBook(book: Book, references: ContentReference[]): Promise<StoredBook> {
  const blob = await uploadBlob(book.blob);
  references.push(blob);
  const assets =
    book.assets === undefined ? undefined : ([] as NonNullable<StoredBook['content']['assets']>);
  for (const asset of book.assets ?? []) {
    const uploaded = await uploadBlob(asset.blob);
    references.push(uploaded);
    assets!.push({ path: asset.path, blob: uploaded });
  }
  return { metadata: bookMetadata(book), content: { blob, chapters: book.chapters, assets } };
}
export async function releaseUploads(references: ContentReference[]) {
  await Promise.all(references.map((reference) => storageRequest('release', reference.token)));
}

export const storage = {
  books: () => storageRequest<BookMetadata[]>('books'),
  metadata: (id: string) =>
    storageRequest<BookMetadata | null | undefined>('metadata', id).then(
      (value) => value ?? undefined,
    ),
  book: (id: string): Promise<Book | null> =>
    trackStorage(
      (async () => {
        const stored = await storageRequest<(StoredBook & { lease: string }) | null>('book', id);
        if (!stored) return null;
        try {
          const blob = await readBlob(stored.content.blob, stored.lease);
          const assets =
            stored.content.assets === undefined ? undefined : ([] as NonNullable<Book['assets']>);
          for (const asset of stored.content.assets ?? [])
            assets!.push({ path: asset.path, blob: await readBlob(asset.blob, stored.lease) });
          return {
            ...stored.metadata,
            blob,
            ...(stored.content.chapters === undefined ? {} : { chapters: stored.content.chapters }),
            ...(assets === undefined ? {} : { assets }),
          };
        } finally {
          await storageRequest('release', stored.lease);
        }
      })(),
    ),
  putBook: (book: Book) =>
    trackStorage(
      (async () => {
        const references: ContentReference[] = [];
        try {
          await storageRequest('putBook', await stageBook(book, references));
        } finally {
          await releaseUploads(references);
        }
      })(),
    ),
  updateBook: (book: BookMetadata) => storageRequest('updateBook', bookMetadata(book)),
  deleteBook: async (id: string) => {
    await storageRequest('deleteBook', id);
    forgetPreference(`folio-position:${id}`);
  },
  annotations: (id?: string) => storageRequest<Annotation[]>('annotations', id),
  annotationCounts: () => storageRequest<Record<string, number>>('annotationCounts'),
  putAnnotation: (mark: Annotation) => storageRequest('putAnnotations', [mark]),
  putAnnotations: (marks: Annotation[]) => storageRequest('putAnnotations', marks),
  replaceAnnotations: (remove: string[], restore: Annotation[]) =>
    storageRequest('replaceAnnotations', { remove, restore }),
  deleteAnnotation: (id: string) => storageRequest('deleteAnnotation', id),
};
export async function fingerprint(data: ArrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, '0')).join('');
}
