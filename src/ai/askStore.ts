import { storageRequest } from '@/lib/storageClient';
import type { TextAnchor } from './document';

export interface AskMessage {
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  createdAt: number;
}

export interface AskThread extends TextAnchor {
  id: string;
  bookId: string;
  createdAt: number;
  messages: AskMessage[];
}

export const askStore = {
  threads: (bookId: string) => storageRequest<AskThread[]>('askThreads', bookId),
  putThread: ({ messages: _messages, ...thread }: AskThread) =>
    storageRequest('putAskThread', thread),
  putMessage: (threadId: string, ordinal: number, message: AskMessage) =>
    storageRequest('putAskMessage', { threadId, ordinal, ...message }),
  deleteThread: (id: string) => storageRequest('deleteAskThread', id),
};
