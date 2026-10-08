import { beforeEach, expect, test, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { catalogFetch } from '../../../../electron/platform/catalogFetch.ts';

const factory = vi.hoisted(() => vi.fn());
vi.mock('electron', () => ({ net: { request: factory } }));
let request: EventEmitter & { abort: ReturnType<typeof vi.fn> };
beforeEach(() => {
  request = Object.assign(new EventEmitter(), {
    abort: vi.fn(),
    end: vi.fn(),
    setHeader: vi.fn(),
  });
  factory.mockReset().mockReturnValue(request);
});
function response(statusCode = 200) {
  const message = Object.assign(new EventEmitter(), {
    statusCode,
    headers: { 'content-length': '3', 'content-type': 'application/octet-stream' },
  });
  request.emit('response', message);
  return message;
}
test('exposes a native redirect without following it or rejecting the response', async () => {
  const pending = catalogFetch('https://github.com/catalog');
  request.emit('redirect', 302, 'GET', 'https://assets.example/catalog', {});
  request.emit('error', new Error('Redirect was cancelled'));
  const result = await pending;
  expect(result.status).toBe(302);
  expect(result.headers.get('location')).toBe('https://assets.example/catalog');
  expect(request.abort).toHaveBeenCalledOnce();
  expect(factory).toHaveBeenCalledWith({
    url: 'https://github.com/catalog',
    redirect: 'manual',
    credentials: 'omit',
  });
});
test('streams native response bytes and preserves content length', async () => {
  const pending = catalogFetch('https://assets.example/package');
  const message = response();
  const result = await pending;
  message.emit('data', Buffer.from('abc'));
  message.emit('end');
  expect(result.headers.get('content-length')).toBe('3');
  expect(await result.text()).toBe('abc');
  expect(request.abort).not.toHaveBeenCalled();
});
test('cancels the native request before headers and rejects the pending fetch', async () => {
  const controller = new AbortController();
  const pending = catalogFetch('https://assets.example/package', { signal: controller.signal });
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  controller.abort();
  await rejected;
  expect(request.abort).toHaveBeenCalledOnce();
});
test('cancellation after headers rejects a pending body read', async () => {
  const controller = new AbortController();
  const pending = catalogFetch('https://assets.example/package', { signal: controller.signal });
  const message = response();
  const reader = (await pending).body!.getReader();
  const rejected = expect(reader.read()).rejects.toMatchObject({ name: 'AbortError' });
  controller.abort();
  message.emit('aborted');
  await rejected;
  expect(request.abort).toHaveBeenCalledOnce();
});
test('stream failure rejects readers and cancelling a stream aborts the native request', async () => {
  let pending = catalogFetch('https://assets.example/package');
  const message = response();
  const failed = expect((await pending).text()).rejects.toThrow('Connection lost');
  message.emit('error', new Error('Connection lost'));
  await failed;
  pending = catalogFetch('https://assets.example/package');
  const second = response();
  await (await pending).body!.cancel();
  second.emit('data', Buffer.from('late'));
  second.emit('aborted');
  expect(request.abort).toHaveBeenCalledOnce();
});
test('rejects empty native responses before constructing a response body', async () => {
  const pending = catalogFetch('https://assets.example/package');
  const rejected = expect(pending).rejects.toThrow('缺少内容');
  response(204);
  await rejected;
  expect(request.abort).toHaveBeenCalledOnce();
});
