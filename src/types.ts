export type Theme = 'light' | 'dark' | 'system';
export type MarkKind = 'highlight' | 'underline';
export type MarkColor = 'amber' | 'green' | 'blue' | 'pink';
export interface ReadingLocation {
  page: number;
  offset?: number;
  ratio: number;
  xRatio?: number;
  screenY?: number;
}
export interface ReadingLayout {
  continuous: boolean;
  spread: boolean;
}
export interface ReadingState extends ReadingLocation {
  layout: ReadingLayout;
  zoom: number;
}
export interface BookMetadata {
  format?: 'pdf' | 'markdown';
  id: string;
  title: string;
  author: string;
  filename: string;
  pages: number;
  cover: string;
  addedAt: number;
  openedAt: number;
  page: number;
  favorite: boolean;
  bookmarks?: number[];
  bookmarkLocations?: Record<number, ReadingLocation>;
  sample?: boolean;
}
export interface BookContent {
  id: string;
  blob: Blob;
  chapters?: MarkdownChapter[];
  assets?: MarkdownAsset[];
}
export interface Book extends BookMetadata, BookContent {}
export interface MarkdownChapter {
  path: string;
  title: string;
  content: string;
}
export interface MarkdownAsset {
  path: string;
  blob: Blob;
}
export interface ImportFile {
  name: string;
  blob: Blob;
}
export interface ImportSource {
  name: string;
  files: ImportFile[];
  folder?: boolean;
}
export interface DesktopFile {
  name: string;
  data: Uint8Array;
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
export interface PageContent {
  page: number;
  text: string;
  tokens: Token[];
  source: 'text' | 'ocr';
  width?: number;
  height?: number;
}
export interface ContentStructure {
  role?: string;
  children?: ContentStructure[];
  type?: string;
  id?: string;
  alt?: string;
}
export interface Settings {
  theme: Theme;
  readerTheme: 'follow' | 'light' | 'dark';
  originalColors?: boolean;
  frostedGlass: boolean;
  glassTransparency: number;
}
export interface WindowState {
  maximized: boolean;
  fullscreen: boolean;
}
export interface DesktopAPI {
  openPDF: () => Promise<DesktopFile[] | null>;
  openFolder: () => Promise<{ name: string; files: DesktopFile[] } | null>;
  openExternal: (url: string) => Promise<void>;
  saveFile: (name: string, data: Uint8Array) => Promise<boolean>;
  onOpenFile: (callback: (file: { name: string; data: Uint8Array }) => void) => () => void;
  ready: () => void;
  setTheme: (theme: Settings['theme']) => void;
  setFrostedGlass: (enabled: boolean) => void;
  platform: string;
  translucent: boolean;
  minimizeWindow: () => void;
  toggleMaximizeWindow: () => void;
  closeWindow: () => void;
  getWindowState: () => Promise<WindowState>;
  onWindowState: (callback: (state: WindowState) => void) => () => void;
}
declare global {
  interface Window {
    desktop?: DesktopAPI;
  }
}
