import React, { useMemo, useState } from 'react';
import { Check, CheckCheck, ClipboardCheck, HelpCircle, Sparkles } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel,
  SelectSeparator, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { useTransactions, Transaction } from '@/hooks/useTransactions';
import { useCategories } from '@/hooks/useCategories';
import { useRules } from '@/hooks/useRules';
import { useCurrency } from '@/hooks/useUserSettings';
import { buildReviewQueue, reviewCount, suggestRulePattern } from '@/lib/review';
import { formatTransactionDate } from '@/lib/months';

/** Per-row choices, held until the row is confirmed. */
interface Draft {
  category: string;
  saveRule: boolean;
  pattern: string;
}

function CategorySelect({
  value, onChange, categories, placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  categories: ReturnType<typeof useCategories>['categories'];
  placeholder: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-full sm:w-[200px]">
        <SelectValue placeholder={placeholder} />
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
  );
}

/**
 * Defined at module scope deliberately. Declared inside `Review` it would be a
 * fresh component type on every render, so React would unmount and remount the
 * row on each keystroke and the pattern input would lose focus after one
 * character.
 */
function DecisionRow({
  transaction, hint, draft, categories, busy, onDraftChange, onConfirm, formatCurrency,
}: {
  transaction: Transaction;
  hint?: string;
  draft: Draft;
  categories: ReturnType<typeof useCategories>['categories'];
  busy: boolean;
  onDraftChange: (patch: Partial<Draft>) => void;
  onConfirm: () => void;
  formatCurrency: (amount: number) => string;
}) {
  return (
    <div className="border rounded-md p-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium truncate" title={transaction.Description}>
            {transaction.Description || '(no description)'}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatTransactionDate(transaction.Date)}
            {hint && <> · {hint}</>}
          </p>
        </div>
        <span className="font-medium whitespace-nowrap">
          {formatCurrency(Math.abs(Number(transaction.Amount)))}
        </span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <CategorySelect
          value={draft.category}
          onChange={(category) => onDraftChange({ category })}
          categories={categories}
          placeholder="Choose a category"
        />
        <Button
          size="sm"
          disabled={!draft.category || busy}
          onClick={onConfirm}
          className="sm:ml-auto"
        >
          <Check className="h-4 w-4 mr-1" />
          Confirm
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1 border-t">
        <label className="flex items-center gap-2 text-sm shrink-0">
          <Checkbox
            checked={draft.saveRule}
            onCheckedChange={(checked) => onDraftChange({ saveRule: !!checked })}
          />
          Always use this for
        </label>
        <Input
          value={draft.pattern}
          onChange={(event) => onDraftChange({ pattern: event.target.value })}
          disabled={!draft.saveRule}
          className="h-8 font-mono text-xs"
          aria-label={`Rule pattern for ${transaction.Description}`}
        />
      </div>
    </div>
  );
}

export function Review() {
  const { user } = useAuth();
  const { transactions, loading, mutateTransactions } = useTransactions(user?.uid || null);
  const { categories } = useCategories(user?.uid || null);
  const { rules, addRule, findConflict, updateRule } = useRules(user?.uid || null);
  const { formatCurrency } = useCurrency();

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState(false);

  const queue = useMemo(() => buildReviewQueue(transactions), [transactions]);
  const remaining = reviewCount(queue);

  const draftFor = (transaction: Transaction): Draft =>
    drafts[transaction.id] ?? {
      category: transaction.suggestedCategory || transaction.Category || '',
      saveRule: true,
      pattern: suggestRulePattern(transaction.Description),
    };

  const updateDraft = (transaction: Transaction, patch: Partial<Draft>) =>
    setDrafts((current) => ({
      ...current,
      [transaction.id]: { ...draftFor(transaction), ...patch },
    }));

  /**
   * Saving the rule before the transaction keeps the two consistent if the
   * second write fails: a rule with no confirmed transaction is harmless, a
   * confirmed transaction whose promised rule never saved is a silent lie.
   */
  const saveRuleFor = async (draft: Draft, category: string) => {
    const matchText = draft.pattern.trim();
    if (!draft.saveRule || !matchText) return;
    const conflict = findConflict(matchText);
    if (conflict) await updateRule(conflict.id, { category });
    else await addRule({ matchText, category, createdAt: new Date().toISOString() });
  };

  const confirmOne = async (transaction: Transaction) => {
    const draft = draftFor(transaction);
    if (!draft.category) return;
    setBusy(true);
    try {
      await saveRuleFor(draft, draft.category);
      await mutateTransactions((current) =>
        current.map((row) =>
          row.id === transaction.id
            ? {
                ...row,
                Category: draft.category,
                confirmed: true,
                hasRule: draft.saveRule || row.hasRule,
                // The suggestion has been decided, so drop it. Firebase rejects
                // undefined, hence the explicit removal rather than a spread.
                suggestedCategory: '',
                suggestionConfidence: undefined,
              }
            : row
        )
      );
      setDrafts((current) => {
        const next = { ...current };
        delete next[transaction.id];
        return next;
      });
    } finally {
      setBusy(false);
    }
  };

  /** One write for the whole bucket rather than one per row. */
  const acceptAllAutoFiled = async () => {
    const ids = new Set(queue.autoFiled.map((t) => t.id));
    if (ids.size === 0) return;
    setBusy(true);
    try {
      await mutateTransactions((current) =>
        current.map((row) => (ids.has(row.id) ? { ...row, confirmed: true } : row))
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Layout>
      <div className="flex flex-col min-h-0 flex-1">
        <div className="sticky top-0 z-10 flex h-16 justify-between items-center bg-background border-b -mx-4 px-4 lg:-mx-6 lg:px-6">
          <h1 className="font-medium">Review</h1>
          {remaining > 0 && <Badge variant="secondary">{remaining} to review</Badge>}
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground mt-6">Loading…</p>
        ) : remaining === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-2 text-center py-16">
            <ClipboardCheck className="h-10 w-10 text-muted-foreground/40" />
            <p className="font-medium">Nothing to review</p>
            <p className="text-sm text-muted-foreground">
              Every transaction has a category you've confirmed.
            </p>
          </div>
        ) : (
          <div className="space-y-4 mt-4 pb-10">
            {queue.autoFiled.length > 0 && (
              <Card>
                <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Sparkles className="h-4 w-4" />
                    Filed automatically
                    <Badge variant="secondary">{queue.autoFiled.length}</Badge>
                  </CardTitle>
                  <Button size="sm" onClick={acceptAllAutoFiled} disabled={busy}>
                    <CheckCheck className="h-4 w-4 mr-1" />
                    Accept all
                  </Button>
                </CardHeader>
                <CardContent className="space-y-1">
                  <p className="text-sm text-muted-foreground pb-2">
                    Matched a rule you already trust. Accept the lot, or open Transactions to
                    change any one of them.
                  </p>
                  {queue.autoFiled.slice(0, 40).map((transaction) => (
                    <div
                      key={transaction.id}
                      className="flex items-center justify-between gap-3 text-sm py-1 border-b last:border-0"
                    >
                      <span className="truncate" title={transaction.Description}>
                        {transaction.Description}
                      </span>
                      <span className="flex items-center gap-3 shrink-0">
                        <Badge variant="outline">{transaction.Category}</Badge>
                        <span className="text-muted-foreground whitespace-nowrap">
                          {formatCurrency(Math.abs(Number(transaction.Amount)))}
                        </span>
                      </span>
                    </div>
                  ))}
                  {queue.autoFiled.length > 40 && (
                    <p className="text-xs text-muted-foreground pt-2">
                      …and {queue.autoFiled.length - 40} more.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {queue.needsDecision.length > 0 && (
              <Card>
                <CardHeader className="space-y-0">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <HelpCircle className="h-4 w-4" />
                    Needs a decision
                    <Badge variant="secondary">{queue.needsDecision.length}</Badge>
                  </CardTitle>
                  <p className="text-sm text-muted-foreground pt-1">
                    These merchants span several categories, so the guess needs checking.
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  {queue.needsDecision.map((transaction) => (
                    <DecisionRow
                      key={transaction.id}
                      transaction={transaction}
                      hint={
                        transaction.suggestedCategory
                          ? `suggested ${transaction.suggestedCategory}`
                          : undefined
                      }
                      draft={draftFor(transaction)}
                      categories={categories}
                      busy={busy}
                      onDraftChange={(patch) => updateDraft(transaction, patch)}
                      onConfirm={() => confirmOne(transaction)}
                      formatCurrency={formatCurrency}
                    />
                  ))}
                </CardContent>
              </Card>
            )}

            {queue.uncategorized.length > 0 && (
              <Card>
                <CardHeader className="space-y-0">
                  <CardTitle className="flex items-center gap-2 text-base">
                    No match
                    <Badge variant="secondary">{queue.uncategorized.length}</Badge>
                  </CardTitle>
                  <p className="text-sm text-muted-foreground pt-1">
                    No rule covered these. Pick a category and keep "Always use this for" ticked
                    so the merchant never reaches this screen again.
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  {queue.uncategorized.slice(0, 50).map((transaction) => (
                    <DecisionRow
                      key={transaction.id}
                      transaction={transaction}
                      draft={draftFor(transaction)}
                      categories={categories}
                      busy={busy}
                      onDraftChange={(patch) => updateDraft(transaction, patch)}
                      onConfirm={() => confirmOne(transaction)}
                      formatCurrency={formatCurrency}
                    />
                  ))}
                  {queue.uncategorized.length > 50 && (
                    <p className="text-xs text-muted-foreground">
                      Showing 50 of {queue.uncategorized.length}. Confirm these and the next
                      batch appears.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {rules.length > 0 && (
              <p className="text-xs text-muted-foreground px-1">
                {rules.length} rule{rules.length === 1 ? '' : 's'} saved.
              </p>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
