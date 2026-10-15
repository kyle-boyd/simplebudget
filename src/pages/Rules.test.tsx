import { describe, it, expect } from 'vitest';
import { Rules } from './Rules';
import { pageText, renderPage, screen, waitFor } from '@/test/render';
import { defaultCategories, makeRule, seedUser, storedRules } from '@/test/factories';

const categories = defaultCategories();

describe('Rules', () => {
  it('invites the user to create one when there are none', async () => {
    seedUser({ categories });
    await renderPage(<Rules />, { route: '/rules' });
    expect(pageText()).toContain('No rules yet');
  });

  it('lists the longest pattern first, mirroring how the matcher resolves them', async () => {
    seedUser({
      categories,
      rules: [
        makeRule({ id: 'short', matchText: 'king soopers', category: 'Groceries' }),
        makeRule({ id: 'long', matchText: 'king soopers fuel', category: 'Gas' }),
      ],
    });
    await renderPage(<Rules />, { route: '/rules' });
    const patterns = screen
      .getAllByRole('textbox')
      .map((input) => (input as HTMLInputElement).value)
      .filter((value) => value.includes('king'));
    expect(patterns[0]).toBe('king soopers fuel');
  });

  it('saves an edited pattern on blur', async () => {
    // Regression: matchText was unreachable once a rule existed, so a rule that
    // matched too broadly could only be deleted and recreated.
    seedUser({ categories, rules: [makeRule({ id: 'r1', matchText: 'kroger' })] });
    const { user } = await renderPage(<Rules />, { route: '/rules' });

    const pattern = screen.getByLabelText('Pattern for kroger');
    await user.clear(pattern);
    await user.type(pattern, 'kroger fuel');
    await user.tab();

    await waitFor(() => {
      expect(Object.values(storedRules())[0].matchText).toBe('kroger fuel');
    });
  });

  it('refuses to save a blank pattern, which would match nothing', async () => {
    seedUser({ categories, rules: [makeRule({ id: 'r1', matchText: 'kroger' })] });
    const { user } = await renderPage(<Rules />, { route: '/rules' });

    const pattern = screen.getByLabelText('Pattern for kroger') as HTMLInputElement;
    await user.clear(pattern);
    await user.tab();

    await waitFor(() => {
      expect(pattern.value).toBe('kroger');
    });
    expect(Object.values(storedRules())[0].matchText).toBe('kroger');
  });

  it('toggles always-review', async () => {
    seedUser({ categories, rules: [makeRule({ id: 'r1', matchText: 'amazon' })] });
    const { user } = await renderPage(<Rules />, { route: '/rules' });

    await user.click(screen.getByLabelText('Always review amazon'));

    await waitFor(() => {
      expect(Object.values(storedRules())[0].alwaysReview).toBe(true);
    });
  });

  it('deletes a rule', async () => {
    seedUser({ categories, rules: [makeRule({ id: 'r1', matchText: 'kroger' })] });
    const { user } = await renderPage(<Rules />, { route: '/rules' });

    await user.click(screen.getByLabelText('Delete rule for kroger'));

    await waitFor(() => {
      expect(Object.keys(storedRules())).toHaveLength(0);
    });
  });

  it('filters by pattern and by category', async () => {
    seedUser({
      categories,
      rules: [
        makeRule({ id: 'a', matchText: 'kroger', category: 'Groceries' }),
        makeRule({ id: 'b', matchText: 'conoco', category: 'Gas' }),
      ],
    });
    const { user } = await renderPage(<Rules />, { route: '/rules' });

    await user.type(screen.getByPlaceholderText(/Search patterns/), 'conoco');
    await waitFor(() => {
      expect(screen.queryByLabelText('Pattern for kroger')).toBeNull();
    });
    expect(screen.getByLabelText('Pattern for conoco')).toBeTruthy();
  });

  it('warns when a rule points at a category that no longer exists', async () => {
    // Categories are referenced by name, so a renamed or deleted category
    // leaves rules filing transactions under a name the budget ignores.
    seedUser({ categories, rules: [makeRule({ id: 'r1', matchText: 'kroger', category: 'Ghost' })] });
    await renderPage(<Rules />, { route: '/rules' });
    expect(pageText()).toContain('point at a category that no longer exists');
    expect(pageText()).toContain('is not a category in your budget');
  });
});
