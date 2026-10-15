import React, { useMemo, useState } from 'react';
import { ListFilter, Trash2, AlertTriangle } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel,
  SelectSeparator, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { useCategories } from '@/hooks/useCategories';
import { useRules, Rule } from '@/hooks/useRules';
import { normalizeMerchant } from '@/lib/categorization';

type Categories = ReturnType<typeof useCategories>['categories'];

/** Module scope, so editing a pattern does not remount the row on each keystroke. */
function RuleRow({
  rule, categories, duplicate, invalidCategory, onSave, onDelete,
}: {
  rule: Rule;
  categories: Categories;
  duplicate: boolean;
  invalidCategory: boolean;
  onSave: (updates: Partial<Omit<Rule, 'id'>>) => void;
  onDelete: () => void;
}) {
  const [matchText, setMatchText] = useState(rule.matchText);

  // Commit on blur rather than per keystroke: every save is a whole-node write.
  const commitMatchText = () => {
    const trimmed = matchText.trim();
    if (!trimmed) {
      setMatchText(rule.matchText); // a blank pattern would match nothing
      return;
    }
    if (trimmed !== rule.matchText) onSave({ matchText: trimmed });
  };

  return (
    <div className="border rounded-md p-3 space-y-2">
      <div className="flex flex-col lg:flex-row lg:items-center gap-2">
        <Input
          value={matchText}
          onChange={(event) => setMatchText(event.target.value)}
          onBlur={commitMatchText}
          className="h-9 font-mono text-xs lg:flex-1"
          aria-label={`Pattern for ${rule.matchText}`}
        />
        <Select value={rule.category} onValueChange={(category) => onSave({ category })}>
          <SelectTrigger className="h-9 lg:w-[200px]" aria-label={`Category for ${rule.matchText}`}>
            <SelectValue placeholder="Choose a category" />
          </SelectTrigger>
          <SelectContent>
            {categories.map((category, index) => (
              <React.Fragment key={category.id}>
                <SelectGroup>
                  <SelectLabel>{category.name}</SelectLabel>
                  {category.subcategories.map((sub) => (
                    <SelectItem key={sub.id} value={sub.name}>{sub.name}</SelectItem>
                  ))}
                </SelectGroup>
                {index < categories.length - 1 && <SelectSeparator />}
              </React.Fragment>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm shrink-0 lg:w-[150px]">
          <Checkbox
            checked={!!rule.alwaysReview}
            onCheckedChange={(checked) => onSave({ alwaysReview: !!checked })}
            aria-label={`Always review ${rule.matchText}`}
          />
          Always review
        </label>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-9 p-0 shrink-0 text-muted-foreground hover:text-destructive"
          onClick={onDelete}
          aria-label={`Delete rule for ${rule.matchText}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {(duplicate || invalidCategory) && (
        <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            {invalidCategory && (
              <>
                <strong>{rule.category}</strong> is not a category in your budget, so this rule
                files transactions somewhere they will not count.{' '}
              </>
            )}
            {duplicate && <>Another rule uses the same pattern; the newer one wins.</>}
          </span>
        </div>
      )}
    </div>
  );
}

export function Rules() {
  const { user } = useAuth();
  const { categories } = useCategories(user?.uid || null);
  const { rules, loading, updateRule, deleteRule } = useRules(user?.uid || null);
  const [search, setSearch] = useState('');

  const validCategories = useMemo(
    () => new Set(categories.flatMap((category) => category.subcategories.map((sub) => sub.name))),
    [categories]
  );

  /** Patterns held by more than one rule, which makes the winner ambiguous. */
  const duplicatePatterns = useMemo(() => {
    const counts = new Map<string, number>();
    for (const rule of rules) {
      const key = normalizeMerchant(rule.matchText);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return new Set([...counts].filter(([, count]) => count > 1).map(([key]) => key));
  }, [rules]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const matching = needle
      ? rules.filter(
          (rule) =>
            rule.matchText.toLowerCase().includes(needle) ||
            rule.category.toLowerCase().includes(needle)
        )
      : rules;
    // Longest pattern first, mirroring the order the matcher resolves them in.
    return [...matching].sort((a, b) => b.matchText.length - a.matchText.length);
  }, [rules, search]);

  const needingAttention = useMemo(
    () => rules.filter((rule) => !validCategories.has(rule.category)).length,
    [rules, validCategories]
  );

  return (
    <Layout>
      <div className="flex flex-col min-h-0 flex-1">
        <div className="sticky top-0 z-10 flex h-16 justify-between items-center bg-background border-b -mx-4 px-4 lg:-mx-6 lg:px-6">
          <h1 className="font-medium">Rules</h1>
          <Badge variant="secondary">{rules.length}</Badge>
        </div>

        <div className="mt-4 space-y-3 pb-10">
          <p className="text-sm text-muted-foreground">
            A rule files any transaction whose description contains its pattern. Patterns are
            matched ignoring case, store numbers and reference codes, and the longest matching
            pattern wins — so <span className="font-mono text-xs">king soopers fuel</span> beats{' '}
            <span className="font-mono text-xs">king soopers</span>.
          </p>

          {needingAttention > 0 && (
            <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {needingAttention} rule{needingAttention === 1 ? '' : 's'} point at a category that
              no longer exists.
            </div>
          )}

          <Input
            placeholder="Search patterns and categories..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : rules.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-2">
              <ListFilter className="h-8 w-8 text-muted-foreground/40" />
              <p className="font-medium">No rules yet</p>
              <p className="text-sm text-muted-foreground">
                Confirm a transaction on the Review screen and keep "Always use this for" ticked
                to create one.
              </p>
            </div>
          ) : visible.length === 0 ? (
            <p className="text-sm text-muted-foreground">No rules match "{search}".</p>
          ) : (
            <div className="space-y-2">
              {visible.map((rule) => (
                <RuleRow
                  key={rule.id}
                  rule={rule}
                  categories={categories}
                  duplicate={duplicatePatterns.has(normalizeMerchant(rule.matchText))}
                  invalidCategory={!validCategories.has(rule.category)}
                  onSave={(updates) => updateRule(rule.id, updates)}
                  onDelete={() => deleteRule(rule.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
