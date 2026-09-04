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
    const sendFn = vi.fn().mockRejectedValue(new TypeError("network"));
    await flushQueue(sendFn);
    expect(getQueueLength()).toBe(2);
  });

  it("does not lose a write queued concurrently while flushing an earlier item", async () => {
    queueForRetry({ path: "/api/players", method: "POST", body: { name: "Jan" } });
    let calls = 0;
    const sendFn = vi.fn().mockImplementation(async () => {
      calls += 1;
      if (calls === 1) {
        // Simulate a live user action queuing a new write while the first item is in flight.
        queueForRetry({ path: "/api/players", method: "POST", body: { name: "Piet" } });
        return { ok: true };
      }
      // The concurrently-added item then hits a transient network failure, so it stays queued.
      throw new TypeError("network");
    });
    await flushQueue(sendFn);
    expect(sendFn).toHaveBeenCalledTimes(2);
    expect(getQueueLength()).toBe(1);
  });

  it("drops a write that fails with a non-network error and continues to later items", async () => {
    queueForRetry({ path: "/api/players", method: "POST", body: { name: "Jan" } });
    queueForRetry({ path: "/api/players", method: "POST", body: { name: "Piet" } });
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const sendFn = vi
      .fn()
      .mockRejectedValueOnce(new Error("Naam bestaat al."))
      .mockResolvedValueOnce({ ok: true });
    await flushQueue(sendFn);
    expect(sendFn).toHaveBeenCalledTimes(2);
    expect(getQueueLength()).toBe(0);
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});
