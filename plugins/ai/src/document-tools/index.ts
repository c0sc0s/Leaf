import type { DocumentHandle, Locator, OutlineEntry } from '@leaf/contracts/documents';
import type { Tool } from '../agent/runtime';
import { ToolInputError } from '../agent/runtime';
import { clip } from '../agent/context';

export interface Citation {
  id: string;
  label: string;
  locator: Locator;
}
export class ReferenceCatalog {
  private entries: Citation[];
  constructor(
    private document: DocumentHandle,
    saved: Citation[] = [],
  ) {
    this.entries = saved.filter((entry) => document.locators.validate(entry.locator));
  }
  register(locator: Locator) {
    const key = JSON.stringify(locator),
      existing = this.entries.find((entry) => JSON.stringify(entry.locator) === key);
    if (existing) return existing;
    if (!this.document.locators.validate(locator)) throw new Error('引用位置无效');
    if (this.entries.length >= 1000) throw new Error('当前问答引用数量过多');
    const reference = {
      id: String(Math.max(0, ...this.entries.map((entry) => Number(entry.id))) + 1),
      label: this.document.locators.label(locator),
      locator,
    };
    this.entries.push(reference);
    return reference;
  }
  all() {
    return [...this.entries];
  }
  get(id: string) {
    return this.entries.find((entry) => entry.id === id);
  }
}
export async function readDocument(
  document: DocumentHandle,
  locator: Locator,
  catalog: ReferenceCatalog,
  signal: AbortSignal,
  characters = 16000,
  around = 0,
) {
  if (!document.content) throw new Error('阅读插件尚未提供文本读取能力');
  const result = await document.content.read(
    { locator, maxCharacters: characters, scope: 'unit', around },
    signal,
  );
  signal.throwIfAborted();
  return result.blocks
    .filter((block) => block.kind === 'text')
    .map((block) => `[ref.${catalog.register(block.locator).id}]\n${block.text}`)
    .join('\n\n');
}
export function documentTools(
  document: DocumentHandle,
  catalog: ReferenceCatalog,
  selected: Locator,
): Tool[] {
  const tools: Tool[] = [
    {
      name: 'read_document',
      description:
        '读取已经引用的位置或当前选区附近的原文。reference 为引用编号，省略时读取当前选区。',
      parameters: { type: 'object', properties: { reference: { type: 'string' } } },
      async run(input, signal) {
        const target =
          input.reference === undefined
            ? selected
            : typeof input.reference === 'string'
              ? catalog.get(input.reference)?.locator
              : undefined;
        if (!target) throw new ToolInputError('reference 需要是已提供的引用编号');
        return clip(await readDocument(document, target, catalog, signal), 4000);
      },
    },
  ];
  if (document.search)
    tools.push({
      name: 'search_book',
      description: '搜索整个文档的关键词，返回相关原文和引用编号。',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
      async run(input, signal) {
        if (typeof input.query !== 'string' || !input.query.trim())
          throw new ToolInputError('query 不能为空');
        const hits = await document.search!.search(input.query, { limit: 12, signal });
        signal.throwIfAborted();
        return hits.length
          ? hits.map((hit) => `[ref.${catalog.register(hit.locator).id}] ${hit.excerpt}`).join('\n')
          : '文档中没有找到匹配内容。';
      },
    });
  if (document.navigation && document.content)
    tools.push({
      name: 'read_sections',
      description: `按导航序号读取原文，共 ${document.navigation.count} 个位置，一次最多读取 4 个位置。`,
      parameters: {
        type: 'object',
        properties: { from: { type: 'integer' }, to: { type: 'integer' } },
        required: ['from'],
      },
      async run(input, signal) {
        const from = input.from,
          to = input.to ?? from,
          navigation = document.navigation!;
        if (
          typeof from !== 'number' ||
          typeof to !== 'number' ||
          !Number.isInteger(from) ||
          !Number.isInteger(to) ||
          from < 1 ||
          to < from ||
          to > navigation.count ||
          to - from >= 4
        )
          throw new ToolInputError('from/to 必须是有效导航序号，范围不能超过 4');
        const parts: string[] = [];
        for (let index = from - 1; index < to; index++) {
          signal.throwIfAborted();
          parts.push(
            await readDocument(document, navigation.locator(index), catalog, signal, 12000),
          );
        }
        return clip(parts.join('\n\n'), 4000);
      },
    });
  if (document.outline)
    tools.push({
      name: 'get_outline',
      description: '查看文档目录及各条目的引用编号。',
      parameters: { type: 'object', properties: {} },
      async run(_input, signal) {
        return clip(outlineText(await document.outline!.read(signal), catalog), 2000);
      },
    });
  return tools;
}
export function outlineText(entries: OutlineEntry[], catalog: ReferenceCatalog) {
  return (
    entries
      .slice(0, 200)
      .map(
        (entry) =>
          `${'  '.repeat(Math.min(8, entry.depth))}${entry.title} [ref.${catalog.register(entry.locator).id}]`,
      )
      .join('\n') || '文档没有目录。'
  );
}
