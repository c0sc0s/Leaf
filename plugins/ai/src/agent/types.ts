import type { AiErrorCode, ToolCall, Usage } from '../models/types';

export type {
  AiConfigInput,
  AiConfigSummary,
  AiErrorCode,
  ChatEvent,
  ChatMessage,
  ChatRequest,
  ToolCall,
  ToolSpec,
  Usage,
  WireToolCall,
} from '../models/types';

export interface ChatResult {
  text: string;
  model: string;
  toolCalls: ToolCall[];
  usage: Usage | null;
}

export class AiError extends Error {
  readonly code: AiErrorCode;
  constructor(code: AiErrorCode, message: string) {
    super(message);
    this.name = 'AiError';
    this.code = code;
  }
}
