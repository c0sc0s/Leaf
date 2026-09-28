import type { Annotation } from '../types';
import { WorkerClient } from './workerClient';
export { colors } from './annotationColors';

export async function exportAnnotated(blob: Blob, marks: Annotation[]) {
  // Node tests use the same implementation; browser exports always run off-thread.
  if (typeof Worker === 'undefined') {
    const { writeAnnotatedPDF } = await import('./exportPDF');
    return writeAnnotatedPDF(blob, marks);
  }
  const worker = new WorkerClient<{ blob: Blob; marks: Annotation[] }>(
    new Worker(new URL('./export.worker.ts', import.meta.url), { type: 'module' }),
  );
  try {
    return await worker.run<Uint8Array>({ blob, marks });
  } finally {
    worker.dispose();
  }
}

export async function saveFile(name: string, data: Uint8Array, mime = 'application/pdf') {
  if (window.desktop) return window.desktop.saveFile(name, data);
  const url = URL.createObjectURL(new Blob([data.slice().buffer], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
export function notesMarkdown(title: string, marks: Annotation[]) {
  return (
    `# ${title}\n\n` +
    marks
      .sort((a, b) => a.page - b.page || a.start - b.start || a.createdAt - b.createdAt)
      .map(
        (m) =>
          `## 第 ${m.page} 页 · ${m.kind === 'highlight' ? '高光' : '划线'}\n\n> ${m.quote.replace(/\n/g, '\n> ')}\n\n${m.note || ''}\n`,
      )
      .join('\n')
  );
}
