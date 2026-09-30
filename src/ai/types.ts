import type { AiErrorCode, ToolCall, Usage } from '../../electron/contract';

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
} from '../../electron/contract';

export interface ChatResult {
  text: string;
  model: string;
  toolCalls: ToolCall[];
  usage: Usage;
}

export class AiError extends Error {
  readonly code: AiErrorCode;
  constructor(code: AiErrorCode, message: string) {
    super(message);
    this.name = 'AiError';
    this.code = code;
  }
}
