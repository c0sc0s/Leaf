import type { DocumentContent, PageContent } from '../types';
export function assessDocument(
  pages: PageContent[],
  totalPages: number,
): Pick<DocumentContent, 'suitable' | 'issues'> {
  const issues = pages.flatMap((p) => p.issues || []);
  if (
    pages.length !== totalPages ||
    new Set(pages.map((p) => p.page)).size !== totalPages ||
    pages.some((p, index) => p.page !== index + 1)
  )
    issues.push({ page: 0, code: 'content', message: '整份文档尚未完成解析。' });
  if (!pages.some((p) => p.tokens.length))
    issues.push({ page: 0, code: 'scan', message: '文档没有可提取的正文，默认使用原版阅读。' });
  for (const p of pages) {
    if (
      p.blocks.some(
        (block) => block.type !== 'figure' && p.text.slice(block.start, block.end) !== block.text,
      )
    )
      issues.push({ page: p.page, code: 'content', message: '文字块与提取内容不一致。' });
    for (const t of p.tokens) {
      const retained = p.blocks.filter((b) =>
        b.type === 'figure'
          ? b.coveredTokens?.includes(t.originalIndex)
          : b.start <= t.start && b.end >= t.end,
      );
      if (retained.length !== 1 || p.text.slice(t.start, t.end) !== t.text) {
        issues.push({ page: p.page, code: 'content', message: '有文字未进入内容模型。' });
        break;
      }
    }
    if (p.blocks.some((b) => b.type === 'figure' && !b.image?.src))
      issues.push({ page: p.page, code: 'graphics', message: '图片或图形未能完整保存。' });
  }
  return { suitable: issues.length === 0, issues };
}
