import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { fakeDb } from './fakes/firebase-database';
import { fakeAuth } from './fakes/firebase-auth';

/**
 * The date every test runs at. The Dashboard builds its chart from the trailing
 * N months relative to "now", so this has to be fixed or the suite would drift
 * month to month. Mid-month and mid-year on purpose: it keeps year-boundary
 * arithmetic honest without making every expectation a wrap-around case.
 */
export const TEST_NOW = new Date(2026, 9, 11, 12, 0, 0); // 11 Oct 2026, local time

beforeEach(() => {
  // Fake Date only. setTimeout stays real, so the components that schedule
  // work (Settings' transient messages, Radix animations) behave normally.
  vi.useFakeTimers({ toFake: ['Date'], now: TEST_NOW, shouldAdvanceTime: true });
  fakeDb.reset();
  fakeAuth.reset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// --- jsdom gaps that Radix and Recharts rely on -----------------------------

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

Element.prototype.scrollIntoView ??= function scrollIntoView() {};
Element.prototype.hasPointerCapture ??= function hasPointerCapture() {
  return false;
};
Element.prototype.releasePointerCapture ??= function releasePointerCapture() {};
Element.prototype.setPointerCapture ??= function setPointerCapture() {};

// Recharts measures its container; jsdom reports 0x0 and logs a warning per chart.
Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 800 });
Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 400 });
