import { net } from 'electron';

export function catalogFetch(url: string, init: RequestInit = {}): Promise<Response> {
  return new Promise((resolve, reject) => {
    const signal = init.signal;
    if (signal?.aborted) return reject(signal.reason);
    const request = net.request({ url, redirect: 'manual', credentials: 'omit' });
    let body: ReadableStreamDefaultController<Uint8Array> | undefined;
    let finished = false;
    const cleanup = () => signal?.removeEventListener('abort', abort);
    const fail = (error: unknown) => {
      if (finished) return;
      finished = true;
      cleanup();
      body?.error(error);
      reject(error);
    };
    const abort = () => {
      fail(signal?.reason ?? new Error('插件下载已取消'));
      request.abort();
    };
    request.on('error', fail);
    // net.fetch rejects manual redirects; expose them so CatalogService can validate each target.
    request.on('redirect', (status, _method, location) => {
      finished = true;
      cleanup();
      resolve(new Response(null, { status, headers: { location } }));
      request.abort();
    });
    request.on('response', (response) => {
      if ([204, 205, 304].includes(response.statusCode)) {
        fail(new Error('插件下载响应缺少内容'));
        request.abort();
        return;
      }
      const headers = new Headers();
      for (const [name, values] of Object.entries(response.headers))
        for (const value of Array.isArray(values) ? values : [values]) headers.append(name, value);
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          body = controller;
          response.on('error', fail);
          response.on('aborted', () => fail(new Error('插件下载中断')));
          response.on('end', () => {
            if (finished) return;
            finished = true;
            cleanup();
            controller.close();
          });
          response.on('data', (chunk) => {
            if (!finished) controller.enqueue(chunk);
          });
        },
        cancel() {
          finished = true;
          cleanup();
          request.abort();
        },
      });
      resolve(new Response(stream, { status: response.statusCode, headers }));
    });
    signal?.addEventListener('abort', abort, { once: true });
    new Headers(init.headers).forEach((value, name) => request.setHeader(name, value));
    request.end();
  });
}
