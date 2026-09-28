import { AnnotationMode, OPS } from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { AnalysisIssue, Block, DocumentContent, PageContent, Token } from '../types';
import { extractPage } from './pdf';
import { assessDocument } from './assessment';
import { semanticMap, type Structure } from './reflow';

export const CONTENT_VERSION = 4;
type Rect = number[];
interface Region {
  bounds: Rect;
  kind: string;
  markedId?: string;
  alt?: string;
}
interface BBoxes {
  length: number;
  isEmpty: (i: number) => boolean;
  minX: (i: number) => number;
  minY: (i: number) => number;
  maxX: (i: number) => number;
  maxY: (i: number) => number;
}
const visualOps = new Set<number>([
  OPS.constructPath,
  OPS.stroke,
  OPS.closeStroke,
  OPS.fill,
  OPS.eoFill,
  OPS.fillStroke,
  OPS.eoFillStroke,
  OPS.closeFillStroke,
  OPS.closeEOFillStroke,
  OPS.shadingFill,
  OPS.paintImageMaskXObject,
  OPS.paintImageMaskXObjectGroup,
  OPS.paintImageXObject,
  OPS.paintInlineImageXObject,
  OPS.paintInlineImageXObjectGroup,
  OPS.paintImageXObjectRepeat,
  OPS.paintImageMaskXObjectRepeat,
  OPS.paintSolidColorImageMask,
  OPS.rawFillPath,
]);
const imageOps = new Set<number>([
  OPS.paintImageXObject,
  OPS.paintInlineImageXObject,
  OPS.paintInlineImageXObjectGroup,
  OPS.paintImageXObjectRepeat,
]);
const boundsOf = (t: Token): Rect => [t.x, t.y, t.x + t.width, t.y + t.height];
const area = (r: Rect) => Math.max(0, r[2] - r[0]) * Math.max(0, r[3] - r[1]);
const union = (a: Rect, b: Rect): Rect => [
  Math.min(a[0], b[0]),
  Math.min(a[1], b[1]),
  Math.max(a[2], b[2]),
  Math.max(a[3], b[3]),
];
function intersects(a: Rect, b: Rect, padding = 0) {
  return (
    a[0] <= b[2] + padding &&
    a[2] + padding >= b[0] &&
    a[1] <= b[3] + padding &&
    a[3] + padding >= b[1]
  );
}
function contains(a: Rect, b: Rect, padding = 3) {
  return (
    a[0] - padding <= b[0] &&
    a[1] - padding <= b[1] &&
    a[2] + padding >= b[2] &&
    a[3] + padding >= b[3]
  );
}
function mergeRegions(regions: Region[]) {
  const merged: Region[] = [];
  for (const region of regions) {
    const next = { ...region, bounds: [...region.bounds] };
    for (let i = 0; i < merged.length;) {
      if (intersects(next.bounds, merged[i].bounds, 5)) {
        next.bounds = union(next.bounds, merged[i].bounds);
        if (merged[i].kind !== 'image') next.kind = merged[i].kind;
        next.markedId ||= merged[i].markedId;
        if (merged[i].alt && merged[i].alt !== next.alt)
          next.alt = [next.alt, merged[i].alt].filter(Boolean).join('; ');
        merged.splice(i, 1);
        i = 0;
      } else i++;
    }
    merged.push(next);
  }
  return merged;
}
function issue(content: PageContent, code: AnalysisIssue['code'], message: string) {
  content.issues ||= [];
  if (!content.issues.some((i) => i.code === code && i.message === message))
    content.issues.push({ page: content.page, code, message });
}
function checkTextLayout(content: PageContent, tree: Structure | null) {
  const tokens = content.tokens;
  if (tokens.some((t) => /[\uFFFD\uE000-\uF8FF]/.test(t.text)))
    issue(content, 'content', '文字编码缺失或使用无法解释的私有字符。');
  const roles = semanticMap(tree);
  const fullyTagged = tokens.length > 0 && tokens.every((t) => t.markedId && roles.has(t.markedId));
  if (tree && roles.size && !fullyTagged && tokens.length)
    issue(content, 'order', '语义标签未覆盖全部正文，无法确认完整的结构顺序。');
  const rows = new Map<number, Token[]>();
  for (const t of tokens) {
    const key = Math.round((t.y + t.height * 0.8) / 3);
    const row = rows.get(key) || [];
    row.push(t);
    rows.set(key, row);
  }
  let splitRows = 0;
  for (const row of rows.values()) {
    row.sort((a, b) => a.x - b.x);
    for (let i = 1; i < row.length; i++) {
      const a = row[i - 1],
        b = row[i];
      if (b.x - a.x - a.width > Math.max(30, a.fontSize * 3)) splitRows++;
      if (a.x + a.width - b.x > Math.min(a.width, b.width) * 0.4)
        issue(content, 'order', '文字互相重叠，无法确认可靠的阅读顺序。');
    }
  }
  if (!fullyTagged && splitRows && content.columns !== 2)
    issue(content, 'structure', '包含多列或表格状文字，主要结构无法可靠恢复。');
  if (!fullyTagged && content.columns === 2) {
    const longLines = [...rows.values()].filter(
      (row) => row.map((t) => t.text).join('').length > 70,
    ).length;
    if (longLines < 3) issue(content, 'structure', '分栏与表格无法可靠区分。');
  }
  if (!fullyTagged && tokens.some((t) => /(?:CMMI|CMSY|Math|Symbol)/i.test(t.fontName)))
    issue(content, 'structure', '数学内容缺少可定位的公式结构。');
}
function semanticRegions(tree: Structure | null, tokens: Token[]) {
  const regions: Region[] = [];
  function visit(node: Structure) {
    if (node.role && ['Figure', 'Formula', 'Table'].includes(node.role)) {
      const ids = new Set<string>();
      function collect(n: Structure) {
        if (n.id) ids.add(n.id);
        n.children?.forEach(collect);
      }
      collect(node);
      const parts = tokens.filter((t) => t.markedId && ids.has(t.markedId));
      if (parts.length)
        regions.push({
          bounds: parts.map(boundsOf).reduce(union),
          kind: node.role.toLowerCase(),
          markedId: parts[0].markedId,
          alt: node.alt,
        });
      return;
    }
    node.children?.forEach(visit);
  }
  if (tree) visit(tree);
  return regions;
}
function isRectangle(data: unknown) {
  if (!ArrayBuffer.isView(data) && !Array.isArray(data)) return false;
  const commands = Array.from(data as ArrayLike<number>);
  const points: number[][] = [];
  for (let i = 0; i < commands.length;) {
    const op = commands[i++];
    if (op === 4) continue;
    if (op !== 0 && op !== 1) return false;
    points.push([commands[i++], commands[i++]]);
  }
  return (
    points.length >= 4 &&
    points.length <= 5 &&
    new Set(points.map((p) => p[0])).size === 2 &&
    new Set(points.map((p) => p[1])).size === 2
  );
}
function retainText(content: PageContent, covered: Set<number>) {
  const blocks: Block[] = [];
  for (const block of content.blocks) {
    const parts = content.tokens.filter((t) => t.start >= block.start && t.end <= block.end);
    let run: Token[] = [];
    const flush = () => {
      if (!run.length) return;
      const start = run[0].start,
        end = run[run.length - 1].end;
      blocks.push({
        ...block,
        start,
        end,
        text: content.text.slice(start, end),
        bounds: run.map(boundsOf).reduce(union),
      });
      run = [];
    };
    for (const t of parts) {
      if (covered.has(t.originalIndex)) flush();
      else run.push(t);
    }
    flush();
  }
  return blocks;
}
async function analyzePage(pdf: PDFDocumentProxy, number: number): Promise<PageContent> {
  const content = await extractPage(pdf, number);
  const page = await pdf.getPage(number);
  const [tree, operators, annotations] = await Promise.all([
    page.getStructTree(),
    page.getOperatorList({ intent: 'display', annotationMode: AnnotationMode.DISABLE }),
    page.getAnnotations(),
  ]);
  if (annotations.some((a) => a.subtype !== 'Link'))
    issue(content, 'content', '包含表单或原有批注，统一阅读不能完整呈现。');
  const marked = new Map<number, string>();
  const structureIds = [...semanticMap(tree as Structure | null).keys()];
  const descriptions = new Map<string, string>();
  function describe(node: Structure, inherited = '') {
    const alt = node.alt || inherited;
    if (node.id && alt) descriptions.set(node.id, alt);
    node.children?.forEach((child) => describe(child, alt));
  }
  if (tree) describe(tree as Structure);
  const stack: (string | undefined)[] = [];
  let patterned = false;
  const rectangles = new Set<number>();
  for (let i = 0; i < operators.fnArray.length; i++) {
    const op = operators.fnArray[i],
      args = operators.argsArray[i];
    if (op === OPS.setFillColorN) patterned = true;
    if (op === OPS.beginMarkedContent || op === OPS.beginMarkedContentProps)
      stack.push(
        op === OPS.beginMarkedContentProps && Number.isInteger(args?.[1])
          ? structureIds.find((id) => id.endsWith(`_mc${args[1]}`))
          : undefined,
      );
    if (op === OPS.endMarkedContent) stack.pop();
    const id = [...stack].reverse().find(Boolean);
    if (id) marked.set(i, id);
    if (
      !patterned &&
      op === OPS.constructPath &&
      args?.[0] === OPS.fill &&
      isRectangle(args?.[1]?.[0])
    )
      rectangles.add(i);
    if (op === OPS.setTextRenderingMode && args?.[0] >= 4)
      issue(content, 'graphics', '文字参与裁剪，不能安全分离正文与图形。');
  }
  const scale = Math.min(1.5, 1800 / Math.max(content.width!, content.height!));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  try {
    // The same intent and annotation mode keep recorded operation indices aligned.
    await page.render({
      canvas,
      viewport,
      annotationMode: AnnotationMode.DISABLE,
      recordOperations: true,
    }).promise;
    const boxes = page.recordedBBoxes as BBoxes | null;
    if (!boxes || typeof boxes.minX !== 'function' || boxes.length < operators.fnArray.length)
      throw new Error('PDF 绘图边界不可用');
    const regions: Region[] = semanticRegions(tree as Structure | null, content.tokens);
    const allVisuals: Rect[] = [];
    let hasPaintedContent = false;
    for (let i = 0; i < operators.fnArray.length; i++) {
      const op = operators.fnArray[i];
      if (
        [
          OPS.showText,
          OPS.showSpacedText,
          OPS.nextLineShowText,
          OPS.nextLineSetSpacingShowText,
        ].includes(op)
      )
        hasPaintedContent = true;
      if (!visualOps.has(op)) continue;
      if (
        op === OPS.constructPath &&
        [OPS.endPath, OPS.clip, OPS.eoClip].includes(operators.argsArray[i]?.[0])
      )
        continue;
      if (boxes.isEmpty(i)) continue;
      const bounds = [
        boxes.minX(i) * content.width!,
        boxes.minY(i) * content.height!,
        boxes.maxX(i) * content.width!,
        boxes.maxY(i) * content.height!,
      ];
      if (
        !hasPaintedContent &&
        rectangles.has(i) &&
        area(bounds) >= content.width! * content.height! * 0.98
      ) {
        content.background = 'solid';
        continue;
      }
      hasPaintedContent = true;
      if (!bounds.every(Number.isFinite) || !area(bounds)) {
        issue(content, 'graphics', '有绘图内容无法确定边界。');
        continue;
      }
      allVisuals.push(bounds);
      if (imageOps.has(op) && area(bounds) > content.width! * content.height! * 0.7)
        issue(content, 'scan', '包含整页位图或扫描内容，不使用整页图片代替重排。');
      regions.push({
        bounds,
        kind: imageOps.has(op) ? 'image' : 'graphic',
        markedId: marked.get(i),
        alt: descriptions.get(marked.get(i) || ''),
      });
    }
    const merged = mergeRegions(regions);
    const figures: Block[] = [];
    const covered = new Set<number>();
    for (const region of merged) {
      let bounds = region.bounds;
      const parts = content.tokens.filter((t) => intersects(bounds, boundsOf(t)));
      if (parts.some((t) => !contains(bounds, boundsOf(t))))
        issue(content, 'graphics', '图形与正文交叉，不能完整拆分内容块。');
      const label = parts.map((t) => t.text).join(' ');
      if (label.length > 240 && !['formula', 'table', 'figure'].includes(region.kind))
        issue(content, 'graphics', '图形覆盖了大量正文，无法安全恢复主要结构。');
      for (const t of parts) {
        bounds = union(bounds, boundsOf(t));
        covered.add(t.originalIndex);
      }
      const padding = 3;
      bounds = [
        Math.max(0, bounds[0] - padding),
        Math.max(0, bounds[1] - padding),
        Math.min(content.width!, bounds[2] + padding),
        Math.min(content.height!, bounds[3] + padding),
      ];
      if (
        content.tokens.some(
          (token) => !parts.includes(token) && intersects(bounds, boundsOf(token)),
        )
      )
        issue(content, 'graphics', '图片边界紧邻正文，不能安全保留独立内容块。');
      if (area(bounds) > content.width! * content.height! * 0.65) {
        issue(content, 'graphics', '图形区域接近整页，不能作为独立图片内容可靠重排。');
        continue;
      }
      const crop = document.createElement('canvas');
      crop.width = Math.max(1, Math.ceil((bounds[2] - bounds[0]) * scale));
      crop.height = Math.max(1, Math.ceil((bounds[3] - bounds[1]) * scale));
      const context = crop.getContext('2d');
      if (!context) throw new Error('无法提取图片内容');
      context.drawImage(
        canvas,
        bounds[0] * scale,
        bounds[1] * scale,
        (bounds[2] - bounds[0]) * scale,
        (bounds[3] - bounds[1]) * scale,
        0,
        0,
        crop.width,
        crop.height,
      );
      figures.push({
        type: 'figure',
        text: '',
        start: 0,
        end: 0,
        bounds,
        markedId: region.markedId,
        coveredTokens: parts.map((t) => t.originalIndex),
        image: {
          src: crop.toDataURL('image/png'),
          width: crop.width,
          height: crop.height,
          kind: region.kind,
          alt:
            region.alt || label || `第 ${number} 页的${region.kind === 'image' ? '图片' : '图形'}`,
        },
      });
      crop.width = crop.height = 0;
    }
    content.blocks = retainText(content, covered);
    const body = {
      ...content,
      tokens: content.tokens.filter((token) => !covered.has(token.originalIndex)),
    };
    checkTextLayout(body, tree as Structure | null);
    for (const token of body.tokens) {
      if (!page.commonObjs.has(token.fontName)) continue;
      const font = page.commonObjs.get(token.fontName);
      if (font?.isType3Font || /(?:CMMI|CMSY|Math|Symbol)/i.test(font?.name || '')) {
        issue(body, 'structure', '正文包含无法可靠转换的字形或数学字体。');
        break;
      }
    }
    content.issues = body.issues;
    const imageRegions = regions.filter((region) => region.kind === 'image');
    const structureRoles = semanticMap(tree as Structure | null);
    if (
      imageRegions.some(
        (region) =>
          !region.markedId ||
          !['Figure', 'Formula', 'Table'].includes(structureRoles.get(region.markedId) || ''),
      ) &&
      (!body.tokens.length ||
        (body.tokens.reduce((length, token) => length + token.text.trim().length, 0) < 120 &&
          imageRegions.reduce((sum, region) => sum + area(region.bounds), 0) >
            content.width! * content.height! * 0.25))
    )
      issue(content, 'scan', '页面主要内容在未标记图像中，无法确认照片与扫描正文的区别。');
    const roles = semanticMap(tree as Structure | null);
    const ranks = new Map([...roles.keys()].map((id, index) => [id, index]));
    for (const figure of figures) {
      const b = figure.bounds!;
      const column = (r: Rect) => ((r[0] + r[2]) / 2 < content.width! / 2 ? 0 : 1);
      if (
        content.columns === 2 &&
        b[0] < content.width! * 0.45 &&
        b[2] > content.width! * 0.55 &&
        content.blocks.some((block) => intersects([0, b[1], content.width!, b[3]], block.bounds!))
      )
        issue(content, 'order', '跨栏图形与正文并列，无法确定可靠阅读顺序。');
      const rank = figure.markedId ? ranks.get(figure.markedId) : undefined;
      let position = content.blocks.findIndex((block) => {
        const br = block.markedId ? ranks.get(block.markedId) : undefined;
        if (rank !== undefined && br !== undefined) return br > rank;
        if (content.columns === 2 && column(b) !== column(block.bounds!))
          return column(b) < column(block.bounds!);
        return block.bounds![1] > b[1];
      });
      if (position < 0) position = content.blocks.length;
      content.blocks.splice(position, 0, figure);
    }
    if (allVisuals.some((r) => !figures.some((f) => contains(f.bounds!, r))))
      issue(content, 'graphics', '有图片或图形未进入独立内容块。');
    if (
      !content.tokens.length &&
      allVisuals.some((r) => area(r) > content.width! * content.height! * 0.5)
    )
      issue(content, 'scan', '无文字的页面包含大幅图像，无法确认其内容结构。');
    return content;
  } finally {
    canvas.width = canvas.height = 0;
  }
}
export async function analyzeDocument(
  pdf: PDFDocumentProxy,
  progress: (page: number) => void,
  signal?: AbortSignal,
): Promise<DocumentContent> {
  const pages: PageContent[] = [];
  let imageBytes = 0;
  for (let number = 1; number <= pdf.numPages; number++) {
    signal?.throwIfAborted();
    let content: PageContent;
    try {
      content = await analyzePage(pdf, number);
    } catch (error) {
      signal?.throwIfAborted();
      content = {
        page: number,
        text: '',
        tokens: [],
        blocks: [],
        source: 'text',
        tagged: false,
        columns: 1,
        warnings: [],
        issues: [
          {
            page: number,
            code: 'extraction',
            message: `本页未能完整解析：${error instanceof Error ? error.message : '未知错误'}`,
          },
        ],
      };
    }
    for (const block of content.blocks) {
      imageBytes += block.image?.src.length || 0;
      if (imageBytes > 48 * 1024 * 1024 && block.image) {
        delete block.image;
        issue(content, 'content', '图像内容超过本机重排缓存上限，使用整本原版。');
      }
    }
    pages.push(content);
    progress(number);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  signal?.throwIfAborted();
  return {
    version: CONTENT_VERSION,
    pages,
    totalPages: pdf.numPages,
    ...assessDocument(pages, pdf.numPages),
    analyzedAt: Date.now(),
  };
}
