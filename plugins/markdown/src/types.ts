import type { MarkColor, MarkKind } from '@leaf/contracts/annotations';

export interface MarkdownChapter {
  path: string;
  title: string;
  content: string;
}
export interface RenderedMark {
  id: string;
  page: number;
  start: number;
  end: number;
  kind: MarkKind;
  color: MarkColor;
}
export interface DocumentSelection {
  start: number;
  end: number;
  quote: string;
  x: number;
  y: number;
  rects: number[][];
  anchors: {
    page: number;
    start: number;
    end: number;
    quote: string;
    rects: number[][];
    x: number;
    y: number;
  }[];
}
