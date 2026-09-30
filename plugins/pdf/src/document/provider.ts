import type {
  DocumentHandle,
  DocumentMetadata,
  DocumentProvider,
  DocumentRecord,
  DocumentOpenServices,
  DocumentInteractions,
  ContentReadRequest,
  ContentPage,
  SearchHit,
  OutlineEntry,
} from '@leaf/contracts/documents';
import { locatorPayload } from '@leaf/contracts/documents';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { withSignal } from '@leaf/shared/async';
import { loadPDF, extractPage } from './pdf';
import { resolveDestination } from '../view/destination';
import { pdfLocator, validPDFLocator, renderedMarks } from './locators';
import type { PageContent } from '../types';
import { createPDFSearchIndex, type PDFSearchIndex } from './search';
import { exportPDF } from '../export/index';
import { activeOutlineId } from './outline';

async function openPDF(bytes: Uint8Array, interactions: DocumentInteractions, signal: AbortSignal) {
  signal.throwIfAborted();
  const task = loadPDF(bytes.slice().buffer, (update, reason) => {
    void interactions
      .password(reason === 2 ? '密码不正确，请重新输入' : '输入 PDF 密码', signal)
      .then(
        (password) => {
          if (password === null || signal.aborted) void task.destroy();
          else update(password);
        },
        () => void task.destroy(),
      );
  });
  const abort = () => {
    void task.destroy();
  };
  signal.addEventListener('abort', abort, { once: true });
  try {
    return await withSignal(task.promise, signal);
  } catch (error) {
    await task.destroy();
    throw error;
  } finally {
    signal.removeEventListener('abort', abort);
  }
}

export class PDFHandle implements DocumentHandle {
  readonly locators;
  readonly navigation;
  readonly content;
  readonly outline;
  readonly search;
  readonly export;
  private cache = new Map<number, Promise<PageContent>>();
  private searchIndex?: PDFSearchIndex;
  private closed = false;
  private outlineValue?: Promise<OutlineEntry[]>;

  constructor(
    readonly metadata: DocumentMetadata,
    readonly pdf: PDFDocumentProxy,
    services: DocumentOpenServices,
    pageLabels: string[] | null = null,
  ) {
    this.locators = {
      validate: (locator: Parameters<typeof validPDFLocator>[0]) =>
        validPDFLocator(locator, metadata, pdf.numPages),
      label: (locator: Parameters<typeof validPDFLocator>[0]) =>
        `第 ${Number(locatorPayload(locator).page)} 页`,
    };
    this.navigation = {
      count: pdf.numPages,
      detail: (index: number) => pageLabels?.[index] ?? '',
      label: (index: number) => `第 ${index + 1} 页`,
      locator: (index: number) =>
        pdfLocator(metadata, { page: Math.max(1, Math.min(pdf.numPages, index + 1)) }),
      index: (locator: Parameters<typeof validPDFLocator>[0]) =>
        Number(locatorPayload(locator).page) - 1,
      thumbnail: (index: number, signal: AbortSignal) => this.thumbnail(index, signal),
    };
    this.content = {
      read: (request: ContentReadRequest, signal: AbortSignal) => this.read(request, signal),
    };
    this.outline = {
      read: (signal: AbortSignal) => withSignal(this.readOutline(), signal),
      active: activeOutlineId,
    };
    this.search = {
      search: (
        query: string,
        options: { limit: number; signal: AbortSignal; onProgress?: (fraction: number) => void },
      ) => this.find(query, options),
    };
    this.export = {
      label: '导出批注 PDF',
      run: async (annotations: Parameters<typeof renderedMarks>[0], signal: AbortSignal) => {
        const bytes = await services.readResource('document.pdf', signal);
        const data = await exportPDF(
          bytes,
          renderedMarks(annotations, metadata, pdf.numPages),
          signal,
        );
        return { filename: `${metadata.title}-批注.pdf`, mime: 'application/pdf', data };
      },
    };
  }
  getContent = (page: number): Promise<PageContent> => {
    if (this.closed) return Promise.reject(new Error('文档已关闭'));
    let pending = this.cache.get(page);
    if (pending) {
      this.cache.delete(page);
      this.cache.set(page, pending);
      return pending;
    }
    pending = extractPage(this.pdf, page);
    this.cache.set(page, pending);
    if (this.cache.size > 30) this.cache.delete(this.cache.keys().next().value!);
    const current = pending;
    void pending.catch(() => {
      if (this.cache.get(page) === current) this.cache.delete(page);
    });
    return pending;
  };
  async dispose() {
    if (this.closed) return;
    this.closed = true;
    this.searchIndex?.dispose();
    this.cache.clear();
    await this.pdf.loadingTask.destroy();
  }
  private async read(request: ContentReadRequest, signal: AbortSignal): Promise<ContentPage> {
    if (request.locator && !this.locators.validate(request.locator))
      throw new Error('无效的 PDF 位置');
    const cursor =
      request.cursor && typeof request.cursor === 'object' && !Array.isArray(request.cursor)
        ? request.cursor
        : request.locator
          ? locatorPayload(request.locator)
          : {};
    let page = Math.max(1, Number(cursor.page) || 1),
      offset = Math.max(0, (Number(cursor.offset) || 0) - Math.max(0, request.around ?? 0));
    const firstPage = page;
    let remaining = Math.max(1, Math.min(32000, request.maxCharacters));
    const blocks: ContentPage['blocks'] = [];
    while (
      page <= this.pdf.numPages &&
      remaining > 0 &&
      (request.scope !== 'unit' || page === firstPage)
    ) {
      signal.throwIfAborted();
      const content = await withSignal(this.getContent(page), signal);
      const text = content.text.slice(offset, offset + remaining);
      if (text)
        blocks.push({
          kind: 'text',
          id: `p${page}:${offset}`,
          text,
          locator: pdfLocator(this.metadata, { page, offset, end: offset + text.length }),
        });
      remaining -= text.length;
      offset += text.length;
      if (offset >= content.text.length) {
        page++;
        offset = 0;
      } else break;
    }
    return { blocks, ...(page <= this.pdf.numPages ? { nextCursor: { page, offset } } : {}) };
  }
  private readOutline() {
    if (!this.outlineValue)
      this.outlineValue = (async () => {
        const items: OutlineEntry[] = [];
        const native = await this.pdf.getOutline();
        const walk = async (entries: NonNullable<typeof native>, depth: number) => {
          for (const entry of entries) {
            const location = await resolveDestination(this.pdf, entry.dest).catch(() => null);
            if (location)
              items.push({
                id: `outline:${items.length}`,
                title: entry.title,
                depth,
                locator: pdfLocator(this.metadata, location),
              });
            if (entry.items.length) await walk(entry.items, depth + 1);
          }
        };
        if (native) await walk(native, 0);
        return items;
      })();
    return this.outlineValue;
  }
  private async find(
    query: string,
    options: { limit: number; signal: AbortSignal; onProgress?: (fraction: number) => void },
  ) {
    if (!query.trim()) return [];
    this.searchIndex ??= createPDFSearchIndex();
    const hits: SearchHit[] = [];
    for (let page = 1; page <= this.pdf.numPages && hits.length < options.limit; page++) {
      options.signal.throwIfAborted();
      let matches = await this.searchIndex.search(page, query, undefined, options.signal);
      if (!matches) {
        const content = await withSignal(this.getContent(page), options.signal);
        matches = await this.searchIndex.search(page, query, content.text, options.signal);
      }
      for (const match of matches ?? []) {
        if (hits.length >= options.limit) break;
        hits.push({
          id: `${page}:${match.offset}`,
          locator: pdfLocator(this.metadata, {
            page,
            offset: match.offset,
            end: match.offset + query.length,
          }),
          excerpt: match.excerpt,
          match: { start: match.offset, end: match.offset + query.length },
        });
      }
      options.onProgress?.(page / this.pdf.numPages);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    return hits;
  }
  private async thumbnail(index: number, signal: AbortSignal) {
    signal.throwIfAborted();
    const page = await withSignal(this.pdf.getPage(index + 1), signal);
    const viewport = page.getViewport({ scale: 180 / page.getViewport({ scale: 1 }).width });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const task = page.render({ canvas, viewport });
    const abort = () => task.cancel();
    signal.addEventListener('abort', abort, { once: true });
    try {
      await task.promise;
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) => (value ? resolve(value) : reject(new Error('无法生成缩略图'))),
          'image/webp',
        ),
      );
      return { data: new Uint8Array(await blob.arrayBuffer()), mime: blob.type };
    } finally {
      signal.removeEventListener('abort', abort);
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}

export const pdfProvider: DocumentProvider = {
  id: 'leaf.pdf.document',
  formats: [{ id: 'pdf', label: 'PDF', extensions: ['pdf'], mimeTypes: ['application/pdf'] }],
  async probe(source, signal) {
    signal.throwIfAborted();
    const file = source.files[0];
    return !source.folder &&
      source.files.length === 1 &&
      file &&
      new TextDecoder().decode(file.data.subarray(0, 1024)).includes('%PDF-')
      ? 100
      : 0;
  },
  async import(source, { signal, interactions }) {
    const file = source.files[0];
    const pdf = await openPDF(file.data, interactions, signal);
    try {
      const metadata = await pdf.getMetadata();
      const info = metadata.info as { Title?: string; Author?: string };
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 240 / page.getViewport({ scale: 1 }).width });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const task = page.render({ canvas, viewport });
      const abort = () => task.cancel();
      signal.addEventListener('abort', abort, { once: true });
      try {
        await task.promise;
        signal.throwIfAborted();
      } finally {
        signal.removeEventListener('abort', abort);
      }
      return {
        formatId: 'pdf',
        title: info.Title?.trim() || source.name.replace(/\.pdf$/i, ''),
        author: info.Author?.trim() || '未知作者',
        filename: source.name,
        cover: canvas.toDataURL('image/webp', 0.85),
        files: [{ name: 'document.pdf', data: file.data, mime: 'application/pdf' }],
        data: { pages: pdf.numPages },
        progress: { fraction: 0, label: `1 / ${pdf.numPages}`, ordinal: 1, total: pdf.numPages },
      };
    } finally {
      await pdf.loadingTask.destroy();
    }
  },
  async open(record: DocumentRecord, services: DocumentOpenServices, signal) {
    const bytes = await services.readResource('document.pdf', signal);
    const pdf = await openPDF(bytes, services.interactions, signal);
    try {
      return new PDFHandle(record.metadata, pdf, services, await pdf.getPageLabels());
    } catch (error) {
      await pdf.loadingTask.destroy();
      throw error;
    }
  },
};
