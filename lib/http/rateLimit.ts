let queue = Promise.resolve();
let lastStart = 0;
export function arxivQueue<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  const result = queue.then(async () => {
    signal?.throwIfAborted();
    const delay = 3000 - (Date.now() - lastStart);
    if (delay > 0)
      await new Promise<void>((resolve, reject) => {
        const abort = () => {
          clearTimeout(timer);
          reject(signal?.reason);
        };
        const timer = setTimeout(() => {
          signal?.removeEventListener('abort', abort);
          resolve();
        }, delay);
        signal?.addEventListener('abort', abort, { once: true });
      });
    signal?.throwIfAborted();
    lastStart = Date.now();
    return task();
  });
  queue = result.then(
    () => {},
    () => {},
  );
  return result;
}
