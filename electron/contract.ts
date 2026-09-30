// Types shared by the main process, the preload bridge and the renderer. Keep this file
// free of runtime code: the renderer imports it type-only.

export type Theme = 'light' | 'dark' | 'system';

export interface DesktopFile {
  name: string;
  data: Uint8Array;
}

export interface DesktopFolder {
  name: string;
  files: DesktopFile[];
}

export interface WindowState {
  maximized: boolean;
  fullscreen: boolean;
}

/** Chat messages in the OpenAI-compatible wire format the main process forwards. */
export type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: WireToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface WireToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ToolSpec {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface ChatRequest {
  messages: ChatMessage[];
  tools?: ToolSpec[];
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface Usage {
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
}

export type AiErrorCode = 'unconfigured' | 'config' | 'auth' | 'network' | 'provider' | 'request';

/** One turn streams `text` deltas, then ends with exactly one `done` or `error`. */
export type ChatEvent =
  | { type: 'text'; text: string }
  | {
      type: 'done';
      model: string;
      finishReason: string | null;
      toolCalls: ToolCall[];
      usage: Usage;
    }
  | { type: 'error'; code: AiErrorCode; message: string };

export interface AiConfigSummary {
  baseURL: string;
  model: string;
  hasKey: boolean;
  /** Set by LEAF_AI_* environment variables; the settings form is read-only. */
  managed: boolean;
}

export interface AiConfigInput {
  baseURL: string;
  model: string;
  apiKey?: string;
}

/** What preload exposes as `window.desktop`. */
export interface DesktopAPI {
  storage: {
    request: (operation: string, input?: unknown) => Promise<unknown>;
    onBeforeClose: (callback: () => Promise<void>) => () => void;
  };
  ai: {
    config: () => Promise<AiConfigSummary>;
    configure: (input: AiConfigInput) => Promise<AiConfigSummary>;
    /** Returns a function that cancels the turn. */
    chat: (request: ChatRequest, onEvent: (event: ChatEvent) => void) => () => void;
  };
  platform: string;
  translucent: boolean;
  openPDF: () => Promise<DesktopFile[] | null>;
  openFolder: () => Promise<DesktopFolder | null>;
  openExternal: (url: string) => Promise<void>;
  saveFile: (name: string, data: Uint8Array) => Promise<boolean>;
  ready: () => void;
  setTheme: (theme: Theme) => void;
  setFrostedGlass: (enabled: boolean) => void;
  minimizeWindow: () => void;
  toggleMaximizeWindow: () => void;
  closeWindow: () => void;
  getWindowState: () => Promise<WindowState>;
  onWindowState: (callback: (state: WindowState) => void) => () => void;
  onOpenFile: (callback: (file: DesktopFile) => void) => () => void;
}
