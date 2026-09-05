import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createKeyedDebouncer } from "./keyedDebouncer";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createKeyedDebouncer", () => {
  it("calls the function once after the delay", () => {
    const debouncer = createKeyedDebouncer<[]>(500);
    const fn = vi.fn();
    debouncer.schedule("a", fn);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("resets the timer when scheduled again with the same key before it fires", () => {
    const debouncer = createKeyedDebouncer<[number]>(500);
    const fn = vi.fn();
    debouncer.schedule("a", fn, 1);
    vi.advanceTimersByTime(300);
    debouncer.schedule("a", fn, 2);
    vi.advanceTimersByTime(300);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(2);
  });

  it("tracks different keys independently", () => {
    const debouncer = createKeyedDebouncer<[]>(500);
    const fnA = vi.fn();
    const fnB = vi.fn();
    debouncer.schedule("a", fnA);
    vi.advanceTimersByTime(300);
    debouncer.schedule("b", fnB);
    vi.advanceTimersByTime(200);
    expect(fnA).toHaveBeenCalledTimes(1);
    expect(fnB).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(fnB).toHaveBeenCalledTimes(1);
  });

  it("cancelAll prevents any pending call from firing", () => {
    const debouncer = createKeyedDebouncer<[]>(500);
    const fn = vi.fn();
    debouncer.schedule("a", fn);
    debouncer.cancelAll();
    vi.advanceTimersByTime(1000);
    expect(fn).not.toHaveBeenCalled();
  });

  it("hasPending reports true only while a key's call has not yet fired", () => {
    const debouncer = createKeyedDebouncer<[]>(500);
    const fn = vi.fn();
    expect(debouncer.hasPending("a")).toBe(false);
    debouncer.schedule("a", fn);
    expect(debouncer.hasPending("a")).toBe(true);
    vi.advanceTimersByTime(500);
    expect(debouncer.hasPending("a")).toBe(false);
  });

  it("flushAll invokes every pending call immediately, in place of waiting for the delay", () => {
    const debouncer = createKeyedDebouncer<[number]>(500);
    const fnA = vi.fn();
    const fnB = vi.fn();
    debouncer.schedule("a", fnA, 1);
    debouncer.schedule("b", fnB, 2);
    debouncer.flushAll();
    expect(fnA).toHaveBeenCalledWith(1);
    expect(fnB).toHaveBeenCalledWith(2);
    // Confirm the original timers were also cleared, not just raced against.
    vi.advanceTimersByTime(1000);
    expect(fnA).toHaveBeenCalledTimes(1);
    expect(fnB).toHaveBeenCalledTimes(1);
  });

  it("flushAll is a no-op when nothing is pending", () => {
    const debouncer = createKeyedDebouncer<[]>(500);
    expect(() => debouncer.flushAll()).not.toThrow();
  });
});
