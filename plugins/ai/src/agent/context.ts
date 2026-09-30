import type { ChatMessage, ToolSpec } from './types';

/**
 * A rough count that errs high: one token per CJK character, four Latin characters per token.
 * Compatible services tokenize differently, so the exact count comes back in `usage`.
 */
export function estimateTokens(text: string) {
  let wide = 0;
  for (const char of text) if (char.codePointAt(0)! >= 0x2e80) wide++;
  return wide + Math.ceil((text.length - wide) / 4);
}

/** Cuts text to about `maxTokens`, keeping the part around `focus` (a character offset). */
export function clip(text: string, maxTokens: number, focus = 0) {
  const tokens = estimateTokens(text);
  if (tokens <= maxTokens) return text;
  const length = Math.floor((text.length * maxTokens) / tokens);
  const start = Math.max(0, Math.min(text.length - length, focus - Math.floor(length / 2)));
  const end = start + length;
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}

export function messageTokens(messages: ChatMessage[], tools: ToolSpec[] = []) {
  return (
    messages.reduce((total, message) => total + 8 + estimateTokens(JSON.stringify(message)), 0) +
    estimateTokens(JSON.stringify(tools))
  );
}
export function fitMessages(
  messages: ChatMessage[],
  tools: ToolSpec[],
  budget: number,
): ChatMessage[] {
  if (budget < 256) throw new Error('模型上下文预算过小');
  const groups: ChatMessage[][] = [];
  for (const message of messages) {
    if (
      message.role === 'tool' &&
      groups.at(-1)?.[0].role === 'assistant' &&
      'tool_calls' in groups.at(-1)![0]
    )
      groups.at(-1)!.push({ ...message });
    else groups.push([{ ...message }]);
  }
  const firstUser = groups.find((group) => group[0].role === 'user'),
    lastUser = [...groups].reverse().find((group) => group[0].role === 'user'),
    newest = groups.at(-1);
  const protectedGroups = new Set([firstUser, lastUser, newest]);
  const cost = () => messageTokens(groups.flat(), tools);
  while (cost() > budget) {
    const index = groups.findIndex(
      (group) => group[0].role !== 'system' && !protectedGroups.has(group),
    );
    if (index < 0) break;
    groups.splice(index, 1);
  }
  for (let attempt = 0; cost() > budget && attempt < 16; attempt++) {
    const texts = groups.flat().filter((message) => typeof message.content === 'string');
    const largest = texts.sort(
      (a, b) => estimateTokens(b.content ?? '') - estimateTokens(a.content ?? ''),
    )[0];
    if (!largest?.content) break;
    const excess = cost() - budget,
      tokens = estimateTokens(largest.content),
      target = Math.max(16, tokens - excess - 16);
    if (target >= tokens) break;
    largest.content = clip(
      largest.content,
      target,
      largest === lastUser?.[0] ? largest.content.length : 0,
    );
  }
  if (cost() > budget) throw new Error('模型上下文预算不足以容纳当前工具和问题');
  return groups.flat();
}
