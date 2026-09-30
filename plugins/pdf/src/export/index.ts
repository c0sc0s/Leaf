import { browserWorker } from '@leaf/plugin-sdk/workers';
import type { RenderedMark } from '../types';
import { withSignal } from '@leaf/shared/async';

export async function exportPDF(data: Uint8Array, marks: RenderedMark[], signal: AbortSignal) {
  const blob = new Blob([data.slice().buffer], { type: 'application/pdf' });
  if (typeof Worker === 'undefined') {
    const { writeAnnotatedPDF } = await import('./write');
    return withSignal(writeAnnotatedPDF(blob, marks), signal);
  }
  const worker = browserWorker<{ blob: Blob; marks: RenderedMark[] }>(
    new Worker(new URL('./export.worker.ts', import.meta.url), { type: 'module' }),
  );
  try {
    return await worker.run<Uint8Array>({ blob, marks }, signal);
  } finally {
    worker.dispose();
  }
}
