import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushQueue, getQueueLength, onQueueChange, queueForRetry } from "./retryQueue";

beforeEach(() => {
  localStorage.clear();
});

describe("retryQueue", () => {
  it("stores a queued write and reports its length", () => {
    queueForRetry({ path: "/api/players", method: "POST", body: { name: "Jan" } });
    expect(getQueueLength()).toBe(1);
  });

  it("notifies listeners when the queue changes", () => {
    const listener = vi.fn();
    const unsubscribe = onQueueChange(listener);
    queueForRetry({ path: "/api/players", method: "POST", body: { name: "Jan" } });
    expect(listener).toHaveBeenLastCalledWith(1);
    unsubscribe();
  });

  it("flushes queued writes in order and clears them on success", async () => {
    queueForRetry({ path: "/api/players", method: "POST", body: { name: "Jan" } });
    const sendFn = vi.fn().mockResolvedValue({ ok: true });
    await flushQueue(sendFn);
    expect(sendFn).toHaveBeenCalledWith("/api/players", "POST", { name: "Jan" });
    expect(getQueueLength()).toBe(0);
  });

  it("stops flushing on the first failure, leaving the rest queued", async () => {
    queueForRetry({ path: "/api/players", method: "POST", body: { name: "Jan" } });
    queueForRetry({ path: "/api/players", method: "POST", body: { name: "Piet" } });
    const sendFn = vi.fn().mockRejectedValue(new Error("network"));
    await flushQueue(sendFn);
    expect(getQueueLength()).toBe(2);
  });
});
