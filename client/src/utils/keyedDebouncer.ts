export function createKeyedDebouncer<Args extends unknown[]>(delayMs: number) {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  return {
    schedule(key: string, fn: (...args: Args) => void, ...args: Args): void {
      const existing = timers.get(key);
      if (existing !== undefined) clearTimeout(existing);
      timers.set(
        key,
        setTimeout(() => {
          timers.delete(key);
          fn(...args);
        }, delayMs)
      );
    },
    cancelAll(): void {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    }
  };
}
