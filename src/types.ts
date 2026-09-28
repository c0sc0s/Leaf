export type Theme = 'light' | 'dark' | 'system';
export type MarkKind = 'highlight' | 'underline';
export type MarkColor = 'amber' | 'green' | 'blue' | 'pink';
export interface Book {
  id: string;
  title: string;
  author: string;
  filename: string;
  pages: number;
  blob: Blob;
  cover: string;
  addedAt: number;
  openedAt: number;
  page: number;
  favorite: boolean;
  bookmarks?: number[];
  sample?: boolean;
  category: string;
}
export interface Annotation {
  id: string;
  bookId: string;
  page: number;
  start: number;
  end: number;
  quote: string;
  kind: MarkKind;
  color: MarkColor;
  note: string;
  rects: number[][];
  createdAt: number;
  source: 'text' | 'ocr';
}
export interface Token {
  text: string;
  start: number;
  end: number;
  originalIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontName: string;
  rect: number[];
  markedId?: string;
}
export interface Block {
  type: 'heading' | 'paragraph' | 'list' | 'quote';
  text: string;
  start: number;
  end: number;
}
export interface PageContent {
  page: number;
  text: string;
  tokens: Token[];
  blocks: Block[];
  source: 'text' | 'ocr';
  tagged: boolean;
  columns: number;
  warnings: string[];
}
export interface Settings {
  theme: Theme;
  readerTheme: 'follow' | 'light' | 'dark';
  fontSize: number;
  font: 'serif' | 'sans';
  lineHeight: number;
  width: number;
}
export interface DesktopAPI {
  openPDF: () => Promise<{ name: string; data: Uint8Array }[] | null>;
  saveFile: (name: string, data: Uint8Array) => Promise<boolean>;
  onOpenFile: (callback: (file: { name: string; data: Uint8Array }) => void) => () => void;
  ready: () => void;
  platform: string;
}
declare global {
  interface Window {
    desktop?: DesktopAPI;
  }
}
