import { writeAnnotatedPDF } from './exportPDF';
import type { Annotation } from '../types';
import type { WorkerRequest, WorkerResponse } from './workerClient';

self.onmessage = async ({
  data,
}: MessageEvent<WorkerRequest<{ blob: Blob; marks: Annotation[] }>>) => {
  try {
    const bytes = await writeAnnotatedPDF(data.payload.blob, data.payload.marks);
    self.postMessage({ id: data.id, value: bytes } satisfies WorkerResponse<Uint8Array>, {
      transfer: [bytes.buffer],
    });
  } catch (error) {
    self.postMessage({ id: data.id, error: String(error) } satisfies WorkerResponse<unknown>);
  }
};
