import '@testing-library/jest-dom/jest-globals';
import { afterEach } from '@jest/globals';
import { cleanup } from '@testing-library/react';

afterEach(cleanup);
// jsdom may omit these browser APIs. Network failures are injected by the tests;
// this fallback does not claim to verify the elapsed HTTP timeout.
if (!AbortSignal.timeout) {
  Object.defineProperty(AbortSignal, 'timeout', { configurable: true, value: () => new AbortController().signal });
}
if (!AbortSignal.any) {
  Object.defineProperty(AbortSignal, 'any', { configurable: true, value: (signals: AbortSignal[]) => {
    const controller = new AbortController();
    for (const signal of signals) {
      if (signal.aborted) controller.abort(signal.reason);
      else signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
    }
    return controller.signal;
  } });
}
