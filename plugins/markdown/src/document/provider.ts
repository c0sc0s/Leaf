import type {
  DocumentHandle,
  DocumentMetadata,
  DocumentProvider,
  DocumentRecord,
  DocumentOpenServices,
  Locator,
  ContentReadRequest,
  ContentPage,
} from '@leaf/contracts/documents';
import { belongsToDocument, locatorPayload } from '@leaf/contracts/documents';
import type { Annotation } from '@leaf/contracts/annotations';
import { openMarkdownDocument, type MarkdownDocument } from './markdownService';
import type { MarkdownChapter, RenderedMark } from '../types';
import { importMarkdown, isMarkdown, isMarkdownAsset } from './import';

export function markdownLocator(
  metadata: DocumentMetadata,
  path: string,
  options: { offset?: number; end?: number; heading?: string } = {},
): Locator {
  return {
    documentId: metadata.id,
    revision: metadata.revision,
    schema: 'leaf.markdown',
    version: 1,
    payload: { path, ...options },
  };
}
export class MarkdownHandle implements DocumentHandle {
  readonly locators;
  readonly navigation;
  readonly content;
  readonly outline;
  readonly search;
  constructor(
    readonly metadata: DocumentMetadata,
    readonly chapters: MarkdownChapter[],
    readonly engine: MarkdownDocument,
    readonly record: DocumentRecord,
    readonly services: DocumentOpenServices,
  ) {
    this.locators = {
      validate: (locator: Locator) => this.validate(locator),
      label: (locator: Locator) =>
        `第 ${chapters.findIndex((chapter) => chapter.path === locatorPayload(locator).path) + 1} 章`,
    };
    this.navigation = {
      count: chapters.length,
      label: (index: number) => chapters[index]?.title ?? '',
      locator: (index: number) =>
        markdownLocator(metadata, chapters[Math.max(0, Math.min(chapters.length - 1, index))].path),
      index: (locator: Locator) =>
        chapters.findIndex((chapter) => chapter.path === locatorPayload(locator).path),
    };
    this.content = {
      read: (request: ContentReadRequest, signal: AbortSignal) => this.read(request, signal),
    };
    this.outline = {
      read: async (signal: AbortSignal) =>
        (await engine.outline(signal)).map((entry, index) => ({
          id: `outline:${index}`,
          title: entry.title,
          depth: entry.depth,
          locator: markdownLocator(metadata, chapters[entry.page - 1].path, {
            heading: entry.hash,
          }),
        })),
      active: (locator: Locator, entries: import('@leaf/contracts/documents').OutlineEntry[]) => {
        const payload = locatorPayload(locator),
          sameChapter = entries.filter(
            (entry) => locatorPayload(entry.locator).path === payload.path,
          );
        return (
          sameChapter.find((entry) => locatorPayload(entry.locator).heading === payload.heading)
            ?.id ??
          sameChapter[0]?.id ??
          null
        );
      },
    };
    this.search = {
      search: async (
        query: string,
        options: { limit: number; signal: AbortSignal; onProgress?: (fraction: number) => void },
      ) => {
        const matches = await engine.search(query, options.signal);
        options.signal.throwIfAborted();
        options.onProgress?.(1);
        return matches.slice(0, options.limit).map((entry) => ({
          id: `${entry.page}:${entry.offset}`,
          locator: markdownLocator(metadata, chapters[entry.page - 1].path, {
            offset: entry.offset,
            end: entry.offset + query.trim().length,
          }),
          excerpt: entry.snippet,
          match: { start: entry.offset, end: entry.offset + query.trim().length },
        }));
      },
    };
  }
  dispose() {
    this.engine.dispose();
  }
  pageMarks(annotations: Annotation[], page: number): RenderedMark[] {
    return annotations.flatMap((annotation) =>
      annotation.targets
        .filter((target) => this.validate(target) && this.navigation.index(target) === page - 1)
        .map((target) => {
          const payload = locatorPayload(target);
          return {
            id: annotation.id,
            page,
            start: Number(payload.offset ?? 0),
            end: Number(payload.end ?? 0),
            color: annotation.color,
            kind: annotation.kind,
          };
        }),
    );
  }
  private validate(locator: Locator) {
    if (
      !belongsToDocument(locator, this.metadata) ||
      locator.schema !== 'leaf.markdown' ||
      locator.version !== 1
    )
      return false;
    try {
      const payload = locatorPayload(locator);
      return (
        this.chapters.some((chapter) => chapter.path === payload.path) &&
        (payload.offset === undefined ||
          (Number.isInteger(payload.offset) && Number(payload.offset) >= 0)) &&
        (payload.end === undefined ||
          (Number.isInteger(payload.end) && Number(payload.end) >= Number(payload.offset ?? 0))) &&
        (payload.heading === undefined || typeof payload.heading === 'string')
      );
    } catch {
      return false;
    }
  }
  private async read(request: ContentReadRequest, signal: AbortSignal): Promise<ContentPage> {
    if (request.locator && !this.validate(request.locator)) throw new Error('无效的 Markdown 位置');
    const cursor =
      request.cursor && typeof request.cursor === 'object' && !Array.isArray(request.cursor)
        ? request.cursor
        : request.locator
          ? locatorPayload(request.locator)
          : {};
    let index = Math.max(
        0,
        this.chapters.findIndex((chapter) => chapter.path === cursor.path),
      ),
      offset = Math.max(0, (Number(cursor.offset) || 0) - Math.max(0, request.around ?? 0));
    const firstIndex = index;
    let remaining = Math.max(1, Math.min(32000, request.maxCharacters));
    const blocks: ContentPage['blocks'] = [];
    while (
      index < this.chapters.length &&
      remaining > 0 &&
      (request.scope !== 'unit' || index === firstIndex)
    ) {
      signal.throwIfAborted();
      const text = await this.engine.text(index + 1, signal);
      const excerpt = text.slice(offset, offset + remaining);
      if (excerpt)
        blocks.push({
          kind: 'text',
          id: `${index}:${offset}`,
          text: excerpt,
          locator: markdownLocator(this.metadata, this.chapters[index].path, {
            offset,
            end: offset + excerpt.length,
          }),
        });
      remaining -= excerpt.length;
      offset += excerpt.length;
      if (offset >= text.length) {
        index++;
        offset = 0;
      } else break;
    }
    return {
      blocks,
      ...(index < this.chapters.length
        ? { nextCursor: { path: this.chapters[index].path, offset } }
        : {}),
    };
  }
}

export const markdownProvider: DocumentProvider = {
  id: 'leaf.markdown.document',
  formats: [
    {
      id: 'markdown',
      label: 'Markdown',
      extensions: ['md', 'markdown'],
      mimeTypes: ['text/markdown', 'text/plain'],
      folders: true,
    },
  ],
  async probe(source, signal) {
    signal.throwIfAborted();
    return source.files.some((file) => isMarkdown(file.name)) &&
      (source.folder || source.files.length === 1)
      ? 80
      : 0;
  },
  async import(source, { signal }) {
    signal.throwIfAborted();
    return importMarkdown(source);
  },
  async open(record, services, signal) {
    const data = record.source.data as { chapters?: { path: string; title: string }[] };
    if (!Array.isArray(data.chapters) || !data.chapters.length)
      throw new Error('Markdown 章节索引无效');
    const chapters: MarkdownChapter[] = [];
    for (const chapter of data.chapters) {
      signal.throwIfAborted();
      if (
        typeof chapter.path !== 'string' ||
        typeof chapter.title !== 'string' ||
        !record.source.resources.some(
          (resource) => resource.path === chapter.path && isMarkdown(resource.path),
        )
      )
        throw new Error('Markdown 章节资源缺失');
      chapters.push({
        ...chapter,
        content: new TextDecoder()
          .decode(await services.readResource(chapter.path, signal))
          .replace(/^\uFEFF/, ''),
      });
    }
    const engine = await openMarkdownDocument(chapters, signal);
    return new MarkdownHandle(record.metadata, chapters, engine, record, services);
  },
};
export { isMarkdownAsset };
