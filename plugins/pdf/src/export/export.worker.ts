import { writeAnnotatedPDF } from './write';
import type { RenderedMark } from '../types';
import type { WorkerRequest, WorkerResponse } from '@leaf/shared/workers';

self.onmessage = async ({
  data,
}: MessageEvent<WorkerRequest<{ blob: Blob; marks: RenderedMark[] }>>) => {
  try {
    const bytes = await writeAnnotatedPDF(data.payload.blob, data.payload.marks);
    self.postMessage({ id: data.id, value: bytes } satisfies WorkerResponse<Uint8Array>, {
      transfer: [bytes.buffer],
    });
  } catch (error) {
    self.postMessage({ id: data.id, error: String(error) } satisfies WorkerResponse<unknown>);
  }
};
