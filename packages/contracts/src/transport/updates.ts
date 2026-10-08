export type UpdateStatus =
  | 'disabled'
  | 'idle'
  | 'checking'
  | 'current'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'error';

export interface UpdateRelease {
  version: string;
  notes: string;
  url: string;
}

export interface UpdateState {
  status: UpdateStatus;
  currentVersion: string;
  installMode: 'automatic' | 'manual' | 'disabled';
  reason: string | null;
  release: UpdateRelease | null;
  progress: number | null;
  error: string | null;
}

export interface UpdatesAPI {
  getState(): Promise<UpdateState>;
  check(): Promise<void>;
  download(): Promise<void>;
  install(): Promise<void>;
  openRelease(): Promise<void>;
  subscribe(listener: (state: UpdateState) => void): () => void;
}
