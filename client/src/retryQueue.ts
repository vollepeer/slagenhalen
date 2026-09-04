const QUEUE_KEY = "kaartbuddy-pending-writes";

export type PendingWrite = {
  id: string;
  path: string;
  method: string;
  body?: unknown;
  createdAt: string;
};

type Listener = (count: number) => void;
const listeners = new Set<Listener>();
let flushing = false;

function readQueue(): PendingWrite[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
  } catch {
    return [];
  }
}

function writeQueue(queue: PendingWrite[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  listeners.forEach((listener) => listener(queue.length));
}

export function onQueueChange(listener: Listener): () => void {
  listeners.add(listener);
  listener(readQueue().length);
  return () => listeners.delete(listener);
}

export function queueForRetry(entry: Omit<PendingWrite, "id" | "createdAt">) {
  const queue = readQueue();
  queue.push({ ...entry, id: crypto.randomUUID(), createdAt: new Date().toISOString() });
  writeQueue(queue);
}

export function getQueueLength(): number {
  return readQueue().length;
}

export async function flushQueue(
  sendFn: (path: string, method: string, body?: unknown) => Promise<unknown>
): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    let queue = readQueue();
    while (queue.length > 0) {
      const [next, ...rest] = queue;
      try {
        await sendFn(next.path, next.method, next.body);
        queue = rest;
        writeQueue(queue);
      } catch {
        break;
      }
    }
  } finally {
    flushing = false;
  }
}

export function startAutoFlush(sendFn: (path: string, method: string, body?: unknown) => Promise<unknown>): () => void {
  const attempt = () => void flushQueue(sendFn);
  window.addEventListener("online", attempt);
  const interval = window.setInterval(attempt, 15000);
  attempt();
  return () => {
    window.removeEventListener("online", attempt);
    window.clearInterval(interval);
  };
}
