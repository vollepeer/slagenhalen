export function createKeyedDebouncer<Args extends unknown[]>(delayMs: number) {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const pending = new Map<string, { fn: (...args: Args) => void; args: Args }>();

  return {
    schedule(key: string, fn: (...args: Args) => void, ...args: Args): void {
      const existing = timers.get(key);
      if (existing !== undefined) clearTimeout(existing);
      pending.set(key, { fn, args });
      timers.set(
        key,
        setTimeout(() => {
          timers.delete(key);
          pending.delete(key);
          fn(...args);
        }, delayMs)
      );
    },
    hasPending(key: string): boolean {
      return pending.has(key);
    },
    cancelAll(): void {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
      pending.clear();
    },
    flushAll(): void {
      const toRun = Array.from(pending.values());
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
      pending.clear();
      toRun.forEach(({ fn, args }) => fn(...args));
    }
  };
}
