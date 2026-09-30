import { bookTools } from './bookTools';
import { estimateTokens, pagesOutward, passageAround, sectionOf } from './context';
import {
  citationTag,
  unitLabel,
  type DocumentSource,
  type DocumentUnit,
  type TextAnchor,
} from './document';
import { runAgent, type AgentEvent, type AgentResult, type ChatFunction } from './runtime';
import type { ChatMessage } from './types';

const SECTION_BUDGET = 12000;
const HISTORY_BUDGET = 6000;
const PASSAGE_RADIUS = 600;
const MAX_STEPS = 6;

export interface AskTurn {
  role: 'user' | 'assistant';
  content: string;
}

export function systemPrompt(unit: DocumentUnit) {
  const example = citationTag(unit, 12);
  return `你是 Leaf 阅读器里的阅读助手，帮助读者理解他们正在读的书或论文。

- 先依据提供的原文回答。原文不够时，用工具检索全书：search_book 找术语定义和前文，read_pages 读取其他位置，get_outline 查看目录。
- 用到书中内容时，在句末用 ${example} 这样的格式标注出处。只标注你确实读过的位置，不要编造。
- 答案来自通用知识而不是本书时，明确说明“书中没有直接说明”。
- 解释词语或句子时，结合它在本书上下文中的含义，而不只是给出通用释义。
- 用读者提问所用的语言回答，简洁直接；需要时使用列表、公式或代码块。`;
}

/** Builds the book context for one thread; it stays the same across follow-up questions. */
export async function askContext(source: DocumentSource, anchor: TextAnchor): Promise<string> {
  const section = sectionOf(source.outline(), anchor.page, source.length);
  const pageText = await source.text(anchor.page);
  const range = await source.locate(anchor);
  const pages = new Map<number, string>();
  let spent = 0;
  for (const page of pagesOutward(anchor.page, section.first, section.last)) {
    const text = page === anchor.page ? pageText : await source.text(page);
    const cost = estimateTokens(text);
    if (pages.size && spent + cost > SECTION_BUDGET) break;
    pages.set(page, text);
    spent += cost;
  }
  const included = [...pages.keys()].sort((a, b) => a - b);
  const complete = included[0] === section.first && included.at(-1) === section.last;
  const lines = [
    `正在阅读：《${source.title}》${source.author ? `（${source.author}）` : ''}`,
    `当前位置：${section.path.length ? section.path.join(' › ') : '这本书没有目录'}`,
    '',
    `读者选中了${unitLabel(source.unit, anchor.page)}的文字：`,
    '<selection>',
    anchor.quote.trim(),
    '</selection>',
  ];
  if (range)
    lines.push(
      '',
      '选中文字附近的原文：',
      '<passage>',
      passageAround(pageText, range.start, range.end, PASSAGE_RADIUS),
      '</passage>',
    );
  lines.push(
    '',
    complete
      ? `当前章节的原文：`
      : `当前章节较长，下面只包含选中位置附近的部分，其余内容可以用 read_pages 读取：`,
    '<section>',
    ...included.map((page) => `${citationTag(source.unit, page)}\n${pages.get(page)}`),
    '</section>',
  );
  return lines.join('\n');
}

/**
 * Keeps the newest turns that fit the history budget. The book context rides on the first
 * kept question, so the stable prefix (system prompt + context) stays cacheable.
 */
export function askMessages(system: string, context: string, turns: AskTurn[]): ChatMessage[] {
  if (turns.at(-1)?.role !== 'user') throw new Error('对话需要以读者的问题结尾');
  let start = turns.length - 1;
  let spent = estimateTokens(turns[start].content);
  for (let i = start - 1; i >= 1; i -= 2) {
    const cost = estimateTokens(turns[i].content) + estimateTokens(turns[i - 1].content);
    if (spent + cost > HISTORY_BUDGET) break;
    spent += cost;
    start = i - 1;
  }
  const kept = turns.slice(start);
  return [
    { role: 'system', content: system },
    { role: 'user', content: `${context}\n\n读者的问题：${kept[0].content}` },
    ...kept.slice(1).map((turn) => ({ role: turn.role, content: turn.content })),
  ];
}

export async function answer({
  source,
  anchor,
  turns,
  chat,
  signal,
  onEvent,
}: {
  source: DocumentSource;
  anchor: TextAnchor;
  turns: AskTurn[];
  chat: ChatFunction;
  signal: AbortSignal;
  onEvent?: (event: AgentEvent) => void;
}): Promise<AgentResult> {
  const context = await askContext(source, anchor);
  return runAgent({
    chat,
    messages: askMessages(systemPrompt(source.unit), context, turns),
    tools: bookTools(source),
    maxSteps: MAX_STEPS,
    signal,
    onEvent,
  });
}

const CITATION = /\[(p|ch)\.\s*(\d+)(?:\s*[-–]\s*(\d+))?\]/g;

/** Turns [p.12] / [ch.3] citations into Markdown links the answer view renders as jumps. */
export function linkCitations(markdown: string, unit: DocumentUnit) {
  const noun = unit === 'page' ? '页' : '章';
  return markdown.replace(CITATION, (_match, _kind, first: string, last?: string) => {
    const label = last ? `第 ${first}–${last} ${noun}` : `第 ${first} ${noun}`;
    return `[${label}](#leaf-cite-${first})`;
  });
}

export function citedPage(href: string | undefined) {
  const match = href?.match(/^#leaf-cite-(\d+)$/);
  return match ? Number(match[1]) : null;
}
