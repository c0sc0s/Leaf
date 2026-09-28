import type { Block, PageContent, Token } from '../types';
export interface RawToken {
  text: string;
  x: number;
  y: number;
  baseline?: number;
  width: number;
  height: number;
  fontSize: number;
  fontName: string;
  rect: number[];
  originalIndex: number;
  markedId?: string;
}
export interface Structure {
  role?: string;
  children?: (Structure & { type?: string; id?: string })[];
  type?: string;
  id?: string;
}
interface Line {
  tokens: RawToken[];
  y: number;
  x: number;
  size: number;
}
function median(values: number[]) {
  const a = [...values].sort((a, b) => a - b);
  return a[Math.floor(a.length / 2)] || 12;
}
function linesOf(raw: RawToken[]) {
  const lines: Line[] = [];
  for (const t of [...raw].sort((a, b) => (a.baseline ?? a.y) - (b.baseline ?? b.y) || a.x - b.x)) {
    let line = lines.find(
      (l) => Math.abs(l.y - (t.baseline ?? t.y)) < Math.max(2, Math.min(l.size, t.fontSize) * 0.32),
    );
    if (!line) {
      line = { tokens: [], y: t.baseline ?? t.y, x: t.x, size: t.fontSize };
      lines.push(line);
    }
    line.tokens.push(t);
    line.x = Math.min(line.x, t.x);
    line.size = Math.max(line.size, t.fontSize);
  }
  for (const line of lines) line.tokens.sort((a, b) => a.x - b.x);
  return lines;
}
function semanticMap(tree: Structure | null) {
  const roles = new Map<string, string>();
  function visit(node: Structure, parent = 'P') {
    const role = node.role && node.role !== 'Root' ? node.role : parent;
    if (node.id) roles.set(node.id, role);
    node.children?.forEach((n) => visit(n, role));
  }
  if (tree) visit(tree);
  return roles;
}
export function reconstruct(
  raw: RawToken[],
  page: number,
  pageWidth: number,
  tree: Structure | null = null,
  source: 'text' | 'ocr' = 'text',
): PageContent {
  const valid = raw.filter((t) => t.text.trim() && t.width > 0);
  const baseSize = median(valid.map((t) => t.fontSize));
  const roles = semanticMap(tree);
  let lines = linesOf(valid);
  let columns = 1;
  // A persistent empty gutter is stronger evidence of columns than isolated indents.
  const gutter = pageWidth * 0.5;
  const body = valid.filter((t) => t.fontSize < baseSize * 1.35);
  const left = body.filter((t) => t.x + t.width < gutter - 8);
  const right = body.filter((t) => t.x > gutter + 8);
  const crossing = body.filter((t) => t.x < gutter && t.x + t.width > gutter);
  if (!tree && left.length > 5 && right.length > 5 && crossing.length < body.length * 0.05) {
    columns = 2;
    const spanning = lines.filter(
      (l) =>
        l.tokens.some((t) => t.x < gutter && t.x + t.width > gutter) || l.size >= baseSize * 1.35,
    );
    const rest = valid.filter((t) => !spanning.some((l) => l.tokens.includes(t)));
    const barriers = spanning.sort((a, b) => a.y - b.y);
    const ordered: Line[] = [];
    let minY = -Infinity;
    for (const barrier of [...barriers, { y: Infinity } as Line]) {
      const band = rest.filter(
        (t) => (t.baseline ?? t.y) >= minY && (t.baseline ?? t.y) < barrier.y,
      );
      ordered.push(
        ...linesOf(band.filter((t) => t.x < gutter)),
        ...linesOf(band.filter((t) => t.x >= gutter)),
      );
      if (barrier.y !== Infinity) ordered.push(barrier);
      minY = barrier.y + 1;
    }
    lines = ordered;
  }
  if (tree && roles.size) {
    const rank = [...roles.keys()];
    lines.sort((a, b) => {
      const ai = rank.indexOf(a.tokens[0].markedId || ''),
        bi = rank.indexOf(b.tokens[0].markedId || '');
      return ai >= 0 && bi >= 0 ? ai - bi : a.y - b.y;
    });
  }
  const tokens: Token[] = [];
  let text = '';
  const blocks: Block[] = [];
  let current: Block | undefined;
  let previous: Line | undefined;
  for (const line of lines) {
    const role = roles.get(line.tokens[0].markedId || '');
    const heading =
      /^H[1-6]$/.test(role || '') ||
      (line.size >= baseSize * 1.3 && line.tokens.map((t) => t.text).join('').length < 180);
    const list = role === 'LI' || /^\s*(?:[•●▪–]|\d+[.)])\s/.test(line.tokens[0].text);
    const type: Block['type'] = heading
      ? 'heading'
      : list
        ? 'list'
        : role === 'BlockQuote'
          ? 'quote'
          : 'paragraph';
    const breakBlock =
      !current ||
      type !== current.type ||
      type === 'heading' ||
      type === 'list' ||
      (previous &&
        (Math.abs(line.y - previous.y) > baseSize * 1.9 ||
          line.y < previous.y - 3 ||
          Math.abs(line.x - previous.x) > baseSize * 2.5));
    if (breakBlock) {
      current = { type, text: '', start: text.length, end: text.length };
      blocks.push(current);
    }
    for (const rawToken of line.tokens) {
      const start = text.length;
      text += rawToken.text;
      tokens.push({ ...rawToken, start, end: text.length });
      text += ' ';
    }
    current!.end = text.length - 1;
    current!.text = text.slice(current!.start, current!.end);
    previous = line;
  }
  const warnings = [];
  if (!valid.length) warnings.push('这一页没有可提取的文字。可使用 OCR 识别扫描内容。');
  if (columns > 1) warnings.push('检测到双栏排版，已按列重组阅读顺序。');
  if (valid.length && !tree)
    warnings.push('此 PDF 没有语义标签，段落与标题由版面推断；表格、公式和插图请结合原版查看。');
  return { page, text, tokens, blocks, source, tagged: !!tree, columns, warnings };
}
export function tokenRects(content: PageContent, start: number, end: number) {
  return content.tokens
    .filter((t) => t.end > start && t.start < end)
    .map((t) => {
      const [x1, y1, x2, y2] = t.rect;
      const a = Math.max(0, (start - t.start) / t.text.length),
        b = Math.min(1, (end - t.start) / t.text.length);
      return [x1 + (x2 - x1) * a, y1, x1 + (x2 - x1) * b, y2];
    });
}
