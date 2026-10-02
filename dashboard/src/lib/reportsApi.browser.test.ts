import { describe, expect, it, vi } from 'vitest';
import { ReportsApi } from './reportsApi.js';

describe('ReportsApi browser transport', () => {
  it('calls native fetch without rebinding its receiver', async () => {
    const original = globalThis.fetch;
    const nativeLikeFetch = vi.fn(function (this: typeof globalThis) {
      if (this !== globalThis) throw new TypeError('Illegal invocation');
      return Promise.resolve(new Response('[]', { status: 200 }));
    });
    globalThis.fetch = nativeLikeFetch as typeof fetch;
    try {
      await expect(new ReportsApi().schedules()).resolves.toEqual([]);
      expect(nativeLikeFetch).toHaveBeenCalledWith('/reports/schedules', undefined);
    } finally {
      globalThis.fetch = original;
    }
  });
});
