import type { ContentStructure, PageContent, Token } from '../types';
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
export type Structure = ContentStructure;
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
function bodyFontSize(tokens: RawToken[]) {
  const sizes = [...tokens].sort((a, b) => a.fontSize - b.fontSize);
  const midpoint = sizes.reduce((sum, token) => sum + token.text.trim().length, 0) / 2;
  let weight = 0;
  for (const token of sizes) {
    weight += token.text.trim().length;
    if (weight >= midpoint) return token.fontSize;
  }
  return median(tokens.map((token) => token.fontSize));
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
    const role =
      node.role && /^(H[1-6]|P|LI|BlockQuote|Quote|Caption|Figure|Formula|Table)$/.test(node.role)
        ? node.role
        : parent;
    if (node.id) roles.set(node.id, role);
    node.children?.forEach((n) => visit(n, role));
  }
  if (tree) visit(tree);
  return roles;
}
export function indexText(
  raw: RawToken[],
  page: number,
  pageWidth: number,
  tree: Structure | null = null,
  source: 'text' | 'ocr' = 'text',
): PageContent {
  const valid = raw.filter((t) => t.text.trim() && t.width > 0);
  const baseSize = bodyFontSize(valid);
  const roles = semanticMap(tree);
  let lines = linesOf(valid);
  // A persistent empty gutter is stronger evidence of columns than isolated indents.
  const gutter = pageWidth * 0.5;
  const body = valid.filter((t) => t.fontSize < baseSize * 1.35);
  const left = body.filter((t) => t.x + t.width < gutter - 8);
  const right = body.filter((t) => t.x > gutter + 8);
  const crossing = body.filter((t) => t.x < gutter && t.x + t.width > gutter);
  if (!tree && left.length > 5 && right.length > 5 && crossing.length < body.length * 0.05) {
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
    lines = rank.flatMap((id) => linesOf(valid.filter((t) => t.markedId === id)));
    lines.push(...linesOf(valid.filter((t) => !t.markedId || !roles.has(t.markedId))));
  }
  const tokens: Token[] = [];
  let text = '';
  // Keep canonical token offsets stable so existing annotations still locate their source text.
  for (const line of lines) {
    for (const rawToken of line.tokens) {
      const start = text.length;
      text += rawToken.text;
      tokens.push({ ...rawToken, start, end: text.length });
      text += ' ';
    }
  }
  return { page, text, tokens, source };
}
