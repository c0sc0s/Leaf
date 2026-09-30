import type { JsonValue } from '@leaf/shared/types';

export type ParentMessage =
  | { type: 'initialize'; moduleURL: string; environment: Record<string, string | undefined> }
  | { type: 'call'; id: string; method: string; input?: JsonValue; stream: boolean }
  | { type: 'cancel'; id: string }
  | { type: 'hostResult'; id: number; value?: JsonValue; error?: string }
  | { type: 'close' };
export type ChildMessage =
  | { type: 'ready' }
  | { type: 'failed'; message: string }
  | { type: 'event'; id: string; value: JsonValue }
  | { type: 'result'; id: string; value?: JsonValue; error?: string }
  | { type: 'hostCall'; id: number; method: string; input: JsonValue }
  | { type: 'closed' };
export interface BackendProcess {
  send(message: ParentMessage): void;
  listen(receive: (message: ChildMessage) => void, fail: (error: Error) => void): void;
  terminate(): Promise<void>;
}
