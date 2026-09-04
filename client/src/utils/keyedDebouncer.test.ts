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
});
