import { SearchIndex, type SearchRequest } from './searchIndex';
import type { WorkerRequest, WorkerResponse } from '@leaf/shared/workers';

const index = new SearchIndex();
self.onmessage = ({ data }: MessageEvent<WorkerRequest<SearchRequest>>) => {
  try {
    const { page, query, text } = data.payload;
    self.postMessage({
      id: data.id,
      value: index.search(page, query, text),
    } satisfies WorkerResponse<unknown>);
  } catch (error) {
    self.postMessage({ id: data.id, error: String(error) } satisfies WorkerResponse<unknown>);
  }
};
