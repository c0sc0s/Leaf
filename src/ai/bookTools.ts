import { clip } from './context';
import { citationTag, type DocumentSource } from './document';
import { ToolInputError, type Tool } from './runtime';

const SEARCH_LIMIT = 12;
const EXCERPT_RADIUS = 80;
const READ_PAGE_LIMIT = 4;
const READ_BUDGET = 6000;
const OUTLINE_BUDGET = 3000;

function pageNumber(source: DocumentSource, value: unknown, name: string) {
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > source.length)
    throw new ToolInputError(`${name} 需要是 1 到 ${source.length} 之间的整数`);
  return value as number;
}

export async function searchBook(
  source: DocumentSource,
  query: string,
  signal: AbortSignal,
): Promise<string> {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) throw new ToolInputError('query 不能为空');
  const hits: string[] = [];
  for (let page = 1; page <= source.length && hits.length < SEARCH_LIMIT; page++) {
    signal.throwIfAborted();
    const text = await source.text(page);
    const lower = text.toLocaleLowerCase();
    for (
      let at = lower.indexOf(needle);
      at >= 0 && hits.length < SEARCH_LIMIT;
      at = lower.indexOf(needle, at + needle.length)
    ) {
      const excerpt = text
        .slice(Math.max(0, at - EXCERPT_RADIUS), at + needle.length + EXCERPT_RADIUS)
        .replace(/\s+/g, ' ');
      hits.push(`${citationTag(source.unit, page)} …${excerpt}…`);
    }
  }
  return hits.length ? hits.join('\n') : `全书没有找到「${query}」。`;
}

export function bookTools(source: DocumentSource): Tool[] {
  const unit = source.unit === 'page' ? '页' : '章';
  return [
    {
      name: 'search_book',
      description: `在整本书中搜索关键词（不区分大小写），返回最多 ${SEARCH_LIMIT} 处匹配及所在${unit}。适合查找术语的定义、首次出现的位置或前文提到的概念。`,
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: '要查找的词或短语，越短越容易命中' } },
        required: ['query'],
      },
      run: ({ query }, signal) => {
        if (typeof query !== 'string') throw new ToolInputError('query 需要是字符串');
        return searchBook(source, query, signal);
      },
    },
    {
      name: 'read_pages',
      description: `读取连续几${unit}的原文，一次最多 ${READ_PAGE_LIMIT} ${unit}。书中共 ${source.length} ${unit}。`,
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'integer', description: `起始${unit}码` },
          to: { type: 'integer', description: `结束${unit}码（包含）` },
        },
        required: ['from', 'to'],
      },
      async run({ from, to }, signal) {
        const first = pageNumber(source, from, 'from');
        const last = pageNumber(source, to ?? from, 'to');
        if (last < first) throw new ToolInputError('to 不能小于 from');
        if (last - first + 1 > READ_PAGE_LIMIT)
          throw new ToolInputError(`一次最多读取 ${READ_PAGE_LIMIT} ${unit}`);
        const parts: string[] = [];
        for (let page = first; page <= last; page++) {
          signal.throwIfAborted();
          parts.push(`${citationTag(source.unit, page)}\n${await source.text(page)}`);
        }
        return clip(parts.join('\n\n'), READ_BUDGET);
      },
    },
    {
      name: 'get_outline',
      description: `查看全书目录及每个条目所在的${unit}。`,
      parameters: { type: 'object', properties: {} },
      run: async () => {
        const outline = source.outline();
        if (!outline.length) return '这本书没有目录。';
        return clip(
          outline
            .map(
              (item) =>
                `${'  '.repeat(item.depth)}${item.title} ${citationTag(source.unit, item.page)}`,
            )
            .join('\n'),
          OUTLINE_BUDGET,
        );
      },
    },
  ];
}
