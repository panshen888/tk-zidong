export type AsyncLimiter = {
  run: <T>(operation: () => Promise<T>) => Promise<T>;
};

export function createAsyncLimiter(concurrency: number): AsyncLimiter {
  const limit = Math.max(1, Math.floor(concurrency));
  let activeCount = 0;
  const queue: Array<() => void> = [];

  function next() {
    activeCount -= 1;
    const runNext = queue.shift();
    runNext?.();
  }

  return {
    run(operation) {
      return new Promise((resolve, reject) => {
        const execute = () => {
          activeCount += 1;
          operation()
            .then(resolve)
            .catch(reject)
            .finally(next);
        };

        if (activeCount < limit) {
          execute();
          return;
        }

        queue.push(execute);
      });
    },
  };
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, Math.floor(concurrency)), items.length || 1);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await mapper(items[currentIndex], currentIndex);
      }
    }),
  );

  return results;
}

export function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function stagger(index: number, minDelayMs: number, maxDelayMs: number) {
  const safeMin = Math.max(0, minDelayMs);
  const safeMax = Math.max(safeMin, maxDelayMs);
  const jitter = safeMin + Math.floor(Math.random() * (safeMax - safeMin + 1));
  await delay(Math.min(index, 3) * jitter);
}
