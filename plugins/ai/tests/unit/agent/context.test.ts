import { describe, expect, it } from 'vitest';
import { clip, estimateTokens, fitMessages, messageTokens } from '../../../src/agent/context';
describe('Agent context budget', () => {
  it('bounds prompts including tool schemas and keeps tool calls with their results', () => {
    const messages = [
      { role: 'system' as const, content: 'Rules' },
      { role: 'user' as const, content: 'context '.repeat(10000) },
      { role: 'assistant' as const, content: 'old answer' },
      { role: 'user' as const, content: 'latest question' },
      {
        role: 'assistant' as const,
        content: null,
        tool_calls: [
          { id: 'call', type: 'function' as const, function: { name: 'read', arguments: '{}' } },
        ],
      },
      { role: 'tool' as const, tool_call_id: 'call', content: 'passage '.repeat(1000) },
    ];
    const fitted = fitMessages(messages, [], 1000);
    expect(messageTokens(fitted)).toBeLessThanOrEqual(1000);
    expect(fitted.some((message) => message.content === 'latest question')).toBe(true);
    expect(fitted.at(-2)?.role).toBe('assistant');
    expect(fitted.at(-1)?.role).toBe('tool');
    expect((messages[1].content ?? '').length).toBeGreaterThan(10000);
    expect(estimateTokens('你好')).toBe(2);
    expect(clip('abcdef'.repeat(1000), 30).length).toBeLessThan(150);
  });
});
