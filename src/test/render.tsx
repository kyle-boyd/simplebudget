import type { ReactElement } from 'react';
import { render, screen, waitFor, type RenderResult } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '@/hooks/useAuth';
import { SettingsProvider } from '@/hooks/useUserSettings';
import { fakeAuth } from './fakes/firebase-auth';

export { screen, waitFor };
export { within, fireEvent, act } from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';

interface RenderOptions {
  /** Initial URL, for pages that read search params (e.g. `/transactions?category=Gas`). */
  route?: string;
  /** Skip the signed-in user, e.g. when testing the login page. */
  signedOut?: boolean;
}

/**
 * Renders a page inside the providers it needs, with a signed-in user already
 * in place, and waits for the first Firebase reads to land.
 *
 * Seed data with `seedUser(...)` before calling this.
 */
export async function renderPage(
  ui: ReactElement,
  { route = '/', signedOut = false }: RenderOptions = {}
): Promise<RenderResult & { user: ReturnType<typeof userEvent.setup> }> {
  if (!signedOut) fakeAuth.signIn();

  const result = render(
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider>
        <SettingsProvider>{ui}</SettingsProvider>
      </AuthProvider>
    </MemoryRouter>
  );

  // SettingsProvider resolves asynchronously; without this every test would
  // start by asserting against a half-loaded tree.
  await waitFor(() => {
    if (document.body.textContent?.includes('Loading...')) {
      throw new Error('still loading');
    }
  });

  return {
    ...result,
    // advanceTimers keeps user-event's internal waits working under fake Date.
    user: userEvent.setup({ advanceTimers: () => {} }),
  };
}

/** All visible text, for coarse assertions ("does NaN appear anywhere"). */
export function pageText(): string {
  return document.body.textContent ?? '';
}
