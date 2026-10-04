import { describe, it, expect, vi } from 'vitest';
import {
  runCall,
  abortable,
  sleep,
  throwIfAborted,
  OperationAbortedError,
  OperationTimeoutError,
} from './abort';

const never = () => new Promise<never>(() => {});

describe('abortable', () => {
  it('does not start work when the signal is already aborted', async () => {
    const c = new AbortController();
    c.abort();
    const work = vi.fn(async () => 1);
    await expect(abortable(c.signal, work)).rejects.toBeInstanceOf(OperationAbortedError);
    expect(work).not.toHaveBeenCalled();
  });

  it('rejects promptly when aborted mid-flight', async () => {
    const c = new AbortController();
    const p = abortable(c.signal, never);
    c.abort();
    await expect(p).rejects.toBeInstanceOf(OperationAbortedError);
  });

  it('passes through the result and errors of normal work', async () => {
    const c = new AbortController();
    await expect(abortable(c.signal, async () => 42)).resolves.toBe(42);
    await expect(
      abortable(c.signal, async () => {
        throw new Error('rpc down');
      }),
    ).rejects.toThrow('rpc down');
  });
});

describe('runCall', () => {
  it('returns the value when nothing aborts', async () => {
    await expect(runCall(undefined, 1000, async () => 'ok')).resolves.toBe('ok');
  });

  it('rejects with OperationAbortedError and issues no further requests', async () => {
    const c = new AbortController();
    const step1 = vi.fn(async () => {
      c.abort(); // caller cancels while step 1 is running
      return 'a';
    });
    const step2 = vi.fn(async () => 'b');

    const p = runCall({ signal: c.signal }, 1000, async (signal) => {
      await abortable(signal, step1);
      await abortable(signal, step2); // must never start
    });

    await expect(p).rejects.toBeInstanceOf(OperationAbortedError);
    expect(step1).toHaveBeenCalledTimes(1);
    expect(step2).not.toHaveBeenCalled();
  });

  it('issues no request at all when the caller signal is already aborted', async () => {
    const c = new AbortController();
    c.abort();
    const request = vi.fn(async () => 1);
    await expect(
      runCall({ signal: c.signal }, 1000, (signal) => abortable(signal, request)),
    ).rejects.toBeInstanceOf(OperationAbortedError);
    expect(request).not.toHaveBeenCalled();
  });

  it('times out with OperationTimeoutError carrying timeoutMs', async () => {
    vi.useFakeTimers();
    const p = runCall(undefined, 5000, (signal) => abortable(signal, never));
    const assertion = expect(p).rejects.toMatchObject({ name: 'OperationTimeoutError', timeoutMs: 5000 });
    await vi.advanceTimersByTimeAsync(5000);
    await assertion;
    vi.useRealTimers();
  });

  it('boundary: does not time out one ms early', async () => {
    vi.useFakeTimers();
    let done = false;
    const p = runCall(undefined, 5000, (signal) => abortable(signal, never)).catch(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(4999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await p;
    expect(done).toBe(true);
    vi.useRealTimers();
  });

  it('per-call timeoutMs overrides the default, and 0 disables the timeout', async () => {
    vi.useFakeTimers();
    const short = runCall({ timeoutMs: 100 }, 60_000, (s) => abortable(s, never));
    const a = expect(short).rejects.toBeInstanceOf(OperationTimeoutError);
    await vi.advanceTimersByTimeAsync(100);
    await a;

    let settled = false;
    runCall({ timeoutMs: 0 }, 100, (s) => abortable(s, never)).catch(() => (settled = true));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(settled).toBe(false);
    vi.useRealTimers();
  });

  it('cleans up timer and listener after success (no leak, no late abort)', async () => {
    vi.useFakeTimers();
    const c = new AbortController();
    const removeSpy = vi.spyOn(c.signal, 'removeEventListener');
    await runCall({ signal: c.signal }, 5000, async () => 'done');
    expect(removeSpy).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });
});

describe('sleep / polling loop', () => {
  it('stops polling as soon as the signal aborts', async () => {
    vi.useFakeTimers();
    const c = new AbortController();
    const poll = vi.fn(async () => 'NOT_FOUND');

    const p = runCall({ signal: c.signal }, 60_000, async (signal) => {
      for (;;) {
        throwIfAborted(signal);
        await abortable(signal, poll);
        await sleep(1000, signal);
      }
    });
    const assertion = expect(p).rejects.toBeInstanceOf(OperationAbortedError);

    await vi.advanceTimersByTimeAsync(2500); // ~3 polls
    const callsAtAbort = poll.mock.calls.length;
    c.abort();
    await assertion;
    await vi.advanceTimersByTimeAsync(10_000);

    expect(poll.mock.calls.length).toBe(callsAtAbort); // no requests after abort
    vi.useRealTimers();
  });
});
