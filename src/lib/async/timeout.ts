// Bounds a request that may never settle. A send that stalls (the connection dropped while it was in flight) must not hold the
// sync queue, which runs one send at a time: after the limit it fails, and the queue treats it as an unreachable connection.
export function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), ms);
  });
  return Promise.race([work, limit]).finally(() => clearTimeout(timer));
}
