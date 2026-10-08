import { rename } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';

export async function renameWithRetry(source: string, destination: string) {
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(source, destination);
      return;
    } catch (error) {
      // Windows can briefly lock directories containing newly written files.
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt >= 8 || !['EPERM', 'EACCES', 'EBUSY'].includes(code ?? '')) throw error;
      await setTimeout(100 * (attempt + 1));
    }
  }
}
