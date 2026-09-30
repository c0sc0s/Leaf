import { describe, expect, it } from 'vitest';
import { runAgent, ToolInputError, type ChatFunction, type Tool } from '../src/ai/runtime';
import type { ChatRequest, ChatResult } from '../src/ai/types';

const usage = { promptTokens: 10, completionTokens: 2, cachedTokens: 4 };
const reply = (text: string, toolCalls: ChatResult['toolCalls'] = []): ChatResult => ({
  text,
  model: 'mock',
  toolCalls,
  usage,
});

function scripted(results: ChatResult[]) {
  const requests: ChatRequest[] = [];
  const chat: ChatFunction = async (request, { onText }) => {
    requests.push(structuredClone(request));
    const result = results.shift();
    if (!result) throw new Error('unexpected extra call');
    if (result.text) onText?.(result.text);
    return result;
  };
  return { chat, requests };
}

const echo: Tool = {
  name: 'echo',
  description: 'Echo a word',
  parameters: { type: 'object', properties: { word: { type: 'string' } } },
  run: async ({ word }) => {
    if (typeof word !== 'string') throw new ToolInputError('word 需要是字符串');
    return `echo:${word}`;
  },
};
const call = (id: string, args: string) => ({ id, name: 'echo', arguments: args });

describe('agent runtime', () => {
  it('runs tools, feeds results back and returns the final answer with summed usage', async () => {
    const { chat, requests } = scripted([
      reply('looking', [call('1', '{"word":"hi"}')]),
      reply('answer'),
    ]);
    const events: unknown[] = [];
    const result = await runAgent({
      chat,
      messages: [{ role: 'user', content: 'q' }],
      tools: [echo],
      maxSteps: 4,
      signal: new AbortController().signal,
      onEvent: (event) => events.push(event),
    });
    expect(result).toEqual({
      text: 'answer',
      model: 'mock',
      usage: { promptTokens: 20, completionTokens: 4, cachedTokens: 8 },
    });
    expect(requests[1].messages.slice(1)).toEqual([
      {
        role: 'assistant',
        content: 'looking',
        tool_calls: [
          { id: '1', type: 'function', function: { name: 'echo', arguments: '{"word":"hi"}' } },
        ],
      },
      { role: 'tool', tool_call_id: '1', content: 'echo:hi' },
    ]);
    expect(events).toEqual([
      { type: 'text', text: 'looking' },
      { type: 'tool', name: 'echo', input: { word: 'hi' } },
      { type: 'step' },
      { type: 'text', text: 'answer' },
    ]);
  });

  it('shows the model its bad arguments and unknown tools instead of failing', async () => {
    const { chat, requests } = scripted([
      reply('', [
        call('1', '{bad'),
        call('2', '{"word":3}'),
        { id: '3', name: 'nope', arguments: '{}' },
      ]),
      reply('done'),
    ]);
    await runAgent({
      chat,
      messages: [{ role: 'user', content: 'q' }],
      tools: [echo],
      maxSteps: 4,
      signal: new AbortController().signal,
    });
    const results = requests[1].messages.filter((message) => message.role === 'tool');
    expect(results.map((message) => message.content)).toEqual([
      expect.stringContaining('JSON'),
      '错误：word 需要是字符串',
      expect.stringContaining('nope'),
    ]);
  });

  it('withholds tools on the last step so the model must answer', async () => {
    const { chat, requests } = scripted([reply('', [call('1', '{"word":"a"}')]), reply('final')]);
    await runAgent({
      chat,
      messages: [{ role: 'user', content: 'q' }],
      tools: [echo],
      maxSteps: 2,
      signal: new AbortController().signal,
    });
    expect(requests[0].tools).toHaveLength(1);
    expect(requests[1].tools).toBeUndefined();
  });

  it('lets unexpected tool failures crash the run', async () => {
    const broken: Tool = { ...echo, run: async () => Promise.reject(new Error('disk gone')) };
    const { chat } = scripted([reply('', [call('1', '{}')])]);
    await expect(
      runAgent({
        chat,
        messages: [{ role: 'user', content: 'q' }],
        tools: [broken],
        maxSteps: 3,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('disk gone');
  });
});
