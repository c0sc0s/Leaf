import type { MarkColor, MarkKind } from '@leaf/contracts/annotations';

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
export interface RenderedMark {
  id: string;
  page: number;
  start: number;
  end: number;
  quote: string;
  kind: MarkKind;
  color: MarkColor;
  note: string;
  rects: number[][];
  createdAt: number;
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
