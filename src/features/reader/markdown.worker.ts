import { MarkdownEngine, type MarkdownRequest } from './markdownEngine';
import type { WorkerRequest, WorkerResponse } from '@/lib/workerClient';

let engine: MarkdownEngine;
self.onmessage = async ({ data }: MessageEvent<WorkerRequest<MarkdownRequest>>) => {
  try {
    const request = data.payload;
    let value: unknown;
    if (request.type === 'init') {
      engine = new MarkdownEngine(request.chapters);
      value = true;
    } else if (request.type === 'render') {
      value = engine.render(request.page, request.query, request.marks);
    } else if (request.type === 'outline') value = await engine.outline();
    else value = engine.search(request.query);
    self.postMessage({ id: data.id, value } satisfies WorkerResponse<unknown>);
  } catch (error) {
    self.postMessage({ id: data.id, error: String(error) } satisfies WorkerResponse<unknown>);
  }
};
