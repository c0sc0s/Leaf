import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { SerialQueue } from '@leaf/shared/async';
import { identifier } from '@leaf/contracts/validation';

export interface CredentialCipher {
  encrypt(value: string): string;
  decrypt(value: string): string;
}
export class CredentialVault {
  private queue = new SerialQueue();
  private file: string;
  private cipher: CredentialCipher;
  constructor(file: string, cipher: CredentialCipher) {
    this.file = file;
    this.cipher = cipher;
  }
  async get(pluginId: string, key: string) {
    const values = await this.read();
    const value = values[this.key(pluginId, key)];
    return value ? this.cipher.decrypt(value) : null;
  }
  set(pluginId: string, key: string, value: string | null) {
    return this.queue.enqueue(async () => {
      if (value !== null && (typeof value !== 'string' || !value || value.length > 16384))
        throw new Error('无效的凭据');
      const values = await this.read();
      if (value === null) delete values[this.key(pluginId, key)];
      else values[this.key(pluginId, key)] = this.cipher.encrypt(value);
      await mkdir(path.dirname(this.file), { recursive: true });
      const temporary = `${this.file}.${process.pid}.tmp`;
      await writeFile(temporary, JSON.stringify(values), { mode: 0o600 });
      await rename(temporary, this.file);
    });
  }
  private key(pluginId: string, key: string) {
    return `${identifier(pluginId)}:${identifier(key)}`;
  }
  private async read(): Promise<Record<string, string>> {
    try {
      return JSON.parse(await readFile(this.file, 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw error;
    }
  }
}

export async function developmentCipher(file: string): Promise<CredentialCipher> {
  await mkdir(path.dirname(file), { recursive: true });
  let key: Buffer;
  try {
    key = await readFile(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    key = randomBytes(32);
    await writeFile(file, key, { flag: 'wx', mode: 0o600 });
  }
  if (key.length !== 32) throw new Error('凭据密钥无效');
  return {
    encrypt(value) {
      const iv = randomBytes(12),
        cipher = createCipheriv('aes-256-gcm', key, iv);
      return Buffer.concat([
        iv,
        cipher.update(value, 'utf8'),
        cipher.final(),
        cipher.getAuthTag(),
      ]).toString('base64');
    },
    decrypt(value) {
      const bytes = Buffer.from(value, 'base64');
      const cipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
      cipher.setAuthTag(bytes.subarray(-16));
      return Buffer.concat([cipher.update(bytes.subarray(12, -16)), cipher.final()]).toString(
        'utf8',
      );
    },
  };
}
