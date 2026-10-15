/**
 * All of the Dashboard's arithmetic, kept pure and currency-free so it can be
 * unit-tested without rendering and so every figure on the page comes from one
 * place. The component does the formatting (`useCurrency`) and the drawing.
 *
 * Two rules from the data model shape everything here:
 *   - Spending excludes income/transfers. Amounts are stored as positive
 *     magnitudes, so the only reliable signal is `flow` ('in' = income/transfer/
 *     refund). A missing `flow` is treated as spending — see `useTransactions`.
 *   - Subcategories of a system ("Hide from Budget") category never count.
 *
 * The hero card and category cards describe *flexible* spending only; fixed
 * (recurring-bill) categories are summarised separately as "bills paid".
 */
import type { Transaction } from '@/hooks/useTransactions';
import { isFixedCategory, type Category } from '@/hooks/useCategories';
import { MONTH_NAMES, parseTransactionDate } from '@/lib/months';

/** Days 1–5 of the current month: too little has happened to project an end figure from. */
export const EARLY_MONTH_DAYS = 5;
/** A category whose projection lands inside ±this of budget reads as "on pace". */
export const ON_PACE_TOLERANCE = 0.03;

export interface MonthSelection {
  year: number;
  month: number; // 0-indexed, as from Date.getMonth()
}

export interface MonthContext extends MonthSelection {
  label: string;        // e.g. "October 2026"
  daysInMonth: number;
  /** Day the pace is measured at: today's date for the current month, the full month once it's over. */
  dayOfMonth: number;
  isCurrent: boolean;
  isPast: boolean;
  isFuture: boolean;
  /** False for days 1–5 of the current month, and for months that haven't started. */
  projectionReliable: boolean;
}

/** The selection for the month containing `now`. */
export function currentMonthSelection(now: Date): MonthSelection {
  return { year: now.getFullYear(), month: now.getMonth() };
}

/** Steps a selection by whole months, normalising the year. */
export function shiftMonth(selection: MonthSelection, delta: number): MonthSelection {
  const d = new Date(selection.year, selection.month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

export function isAfter(a: MonthSelection, b: MonthSelection): boolean {
  return a.year > b.year || (a.year === b.year && a.month > b.month);
}

export function monthContext(selection: MonthSelection, now: Date): MonthContext {
  const today = currentMonthSelection(now);
  const isCurrent = selection.year === today.year && selection.month === today.month;
  const isPast = isAfter(today, selection);
  const isFuture = isAfter(selection, today);
  const daysInMonth = new Date(selection.year, selection.month + 1, 0).getDate();
  const dayOfMonth = isCurrent ? now.getDate() : isPast ? daysInMonth : 0;

  return {
    ...selection,
    label: `${MONTH_NAMES[selection.month]} ${selection.year}`,
    daysInMonth,
    dayOfMonth,
    isCurrent,
    isPast,
    isFuture,
    projectionReliable: isPast || (isCurrent && dayOfMonth > EARLY_MONTH_DAYS),
  };
}

// --- category indexing ------------------------------------------------------

interface CategoryRef {
  name: string;            // top-level category name
  isSystem: boolean;
  isFixed: boolean;
}

/** Maps every category and subcategory name (lowercased) to its top-level category. */
function indexCategories(categories: Category[]): Map<string, CategoryRef> {
  const index = new Map<string, CategoryRef>();
  for (const category of categories) {
    const ref: CategoryRef = {
      name: category.name,
      isSystem: !!category.isSystem,
      isFixed: isFixedCategory(category),
    };
    const add = (name: string | undefined) => {
      const key = name?.trim().toLowerCase();
      if (key && !index.has(key)) index.set(key, ref);
    };
    add(category.name);
    for (const sub of category.subcategories || []) add(sub.name);
  }
  return index;
}

/** Budget for a category: the sum of its subcategory amounts, or its own amount when it has none. */
function categoryBudget(category: Category): number {
  const subs = category.subcategories || [];
  return subs.length > 0
    ? subs.reduce((sum, sub) => sum + (sub.amount || 0), 0)
    : category.amount || 0;
}

function spendAmount(transaction: Transaction): number {
  const amount = Math.abs(transaction.Amount);
  return Number.isFinite(amount) ? amount : 0;
}

/** A transaction counts as spending unless it's income/transfer (`flow: 'in'`). */
export function isSpending(transaction: Transaction): boolean {
  return transaction.flow !== 'in';
}

// --- pace maths -------------------------------------------------------------

export interface PaceMetrics {
  expectedByToday: number;
  vsPace: number;     // spent − expectedByToday (positive = ahead of where it should be)
  projected: number;  // spent / day × N (equals spent once the month is over)
  perDayLeft: number; // budget still available ÷ days remaining
}

export function paceMetrics(spent: number, budget: number, day: number, daysInMonth: number): PaceMetrics {
  const expectedByToday = daysInMonth > 0 ? (budget * day) / daysInMonth : 0;
  const projected = day > 0 ? (spent / day) * daysInMonth : spent;
  const perDayLeft = daysInMonth > day ? Math.max(budget - spent, 0) / (daysInMonth - day) : 0;
  return { expectedByToday, vsPace: spent - expectedByToday, projected, perDayLeft };
}

export type NoteKind =
  | 'too-early'   // days 1–5
  | 'over'        // current month, projected over budget — amount = overBy
  | 'on'          // within tolerance
  | 'spare'       // current month, projected under budget — amount = toSpare
  | 'final-over'  // past month, spent over budget — amount = overBy
  | 'final-on'
  | 'final-under' // past month, spent under budget — amount = underBy
  | 'no-budget';  // spend against a $0 budget

export interface Note {
  kind: NoteKind;
  amount: number;
}

function noteFor(ctx: MonthContext, spent: number, budget: number, projected: number): Note {
  if (ctx.isPast) {
    if (budget <= 0) return { kind: 'no-budget', amount: spent };
    if (spent > budget) return { kind: 'final-over', amount: spent - budget };
    if (Math.abs(spent - budget) / budget <= ON_PACE_TOLERANCE) return { kind: 'final-on', amount: 0 };
    return { kind: 'final-under', amount: budget - spent };
  }
  if (!ctx.projectionReliable) return { kind: 'too-early', amount: 0 };
  if (budget <= 0) return { kind: 'no-budget', amount: projected };
  // "Headed for $projected" names the projected end total, not the overage.
  if (projected > budget) return { kind: 'over', amount: projected };
  if (Math.abs(projected - budget) / budget <= ON_PACE_TOLERANCE) return { kind: 'on', amount: 0 };
  return { kind: 'spare', amount: budget - projected };
}

// --- per-category + hero ----------------------------------------------------

export interface CategorySummary extends PaceMetrics {
  name: string;
  budget: number;
  spent: number;
  note: Note;
  overPace: boolean;   // projected (or final spend) past budget — drives the "$/day left" badge
  risk: number;        // projected ÷ budget, for "riskiest first" sorting
}

export interface FixedBills {
  paid: number;
  total: number;
}

export interface Uncategorized {
  count: number;
  amount: number;
}

export interface BurnUpPoint {
  day: number;
  pace: number;
  actual: number | null;
  projected: number | null;
}

export interface HeroSummary extends PaceMetrics {
  budget: number;
  spent: number;
  overPace: boolean;
  /** 1–2 category names driving any projected overage, worst first. */
  drivers: string[];
}

export interface DashboardData {
  ctx: MonthContext;
  hero: HeroSummary;
  categories: CategorySummary[];
  fixedBills: FixedBills;
  uncategorized: Uncategorized;
  burnUp: BurnUpPoint[];
}

export function summarizeMonth(
  allTransactions: Transaction[],
  categories: Category[],
  ctx: MonthContext
): DashboardData {
  const index = indexCategories(categories);
  const { daysInMonth, dayOfMonth } = ctx;

  const monthTransactions = allTransactions.filter(transaction => {
    const parsed = parseTransactionDate(transaction.Date);
    return !!parsed && parsed.getFullYear() === ctx.year && parsed.getMonth() === ctx.month;
  });

  // Spend per top-level flexible category, plus fixed-bill and uncategorized rollups.
  const flexSpent = new Map<string, number>();
  const flexBudget = new Map<string, number>();
  for (const category of categories) {
    if (category.isSystem || isFixedCategory(category)) continue;
    flexSpent.set(category.name, 0);
    flexBudget.set(category.name, categoryBudget(category));
  }

  let fixedPaid = 0;
  const fixedTotal = categories
    .filter(category => !category.isSystem && isFixedCategory(category))
    .reduce((sum, category) => sum + categoryBudget(category), 0);

  let uncategorizedCount = 0;
  let uncategorizedAmount = 0;
  // Cumulative flexible spend by day-of-month, for the burn-up chart.
  const flexSpendByDay = new Array<number>(daysInMonth + 1).fill(0);

  for (const transaction of monthTransactions) {
    if (!isSpending(transaction)) continue;

    const key = transaction.Category?.trim().toLowerCase();
    const ref = key ? index.get(key) : undefined;

    if (ref?.isSystem) continue; // hidden from budget

    const amount = spendAmount(transaction);

    if (!ref) {
      uncategorizedCount++;
      uncategorizedAmount += amount;
      continue;
    }

    if (ref.isFixed) {
      fixedPaid += amount;
      continue;
    }

    flexSpent.set(ref.name, (flexSpent.get(ref.name) || 0) + amount);

    const parsed = parseTransactionDate(transaction.Date);
    const day = parsed ? parsed.getDate() : 0;
    if (day >= 1 && day <= daysInMonth) flexSpendByDay[day] += amount;
  }

  const summaries: CategorySummary[] = [...flexBudget.keys()].map(name => {
    const budget = flexBudget.get(name) || 0;
    const spent = flexSpent.get(name) || 0;
    const metrics = paceMetrics(spent, budget, dayOfMonth, daysInMonth);
    const reference = ctx.isPast ? spent : metrics.projected;
    const overPace = budget > 0 ? reference > budget : spent > 0;
    const risk = budget > 0 ? reference / budget : spent > 0 ? Infinity : 0;
    return {
      name,
      budget,
      spent,
      ...metrics,
      note: noteFor(ctx, spent, budget, metrics.projected),
      overPace,
      risk,
    };
  });
  // Riskiest first (projected ÷ budget, descending).
  summaries.sort((a, b) => b.risk - a.risk);

  const totalBudget = summaries.reduce((sum, c) => sum + c.budget, 0);
  const totalSpent = summaries.reduce((sum, c) => sum + c.spent, 0);
  const heroMetrics = paceMetrics(totalSpent, totalBudget, dayOfMonth, daysInMonth);
  const heroReference = ctx.isPast ? totalSpent : heroMetrics.projected;
  const drivers = summaries
    .filter(c => c.overPace && (c.budget > 0 ? (ctx.isPast ? c.spent : c.projected) - c.budget : c.spent) > 0)
    .slice(0, 2)
    .map(c => c.name);

  return {
    ctx,
    hero: {
      budget: totalBudget,
      spent: totalSpent,
      ...heroMetrics,
      overPace: totalBudget > 0 ? heroReference > totalBudget : totalSpent > 0,
      drivers,
    },
    categories: summaries,
    fixedBills: { paid: fixedPaid, total: fixedTotal },
    uncategorized: { count: uncategorizedCount, amount: uncategorizedAmount },
    burnUp: buildBurnUp(flexSpendByDay, totalBudget, heroMetrics.projected, ctx),
  };
}

/**
 * Cumulative spend by day against a straight budget-pace line. The actual line
 * runs to today (or month end once past); the projection is a dotted
 * continuation from today to a full-month estimate.
 */
function buildBurnUp(
  flexSpendByDay: number[],
  budget: number,
  projected: number,
  ctx: MonthContext
): BurnUpPoint[] {
  const { daysInMonth, dayOfMonth, isPast } = ctx;
  const points: BurnUpPoint[] = [];
  let cumulative = 0;

  for (let day = 0; day <= daysInMonth; day++) {
    cumulative += flexSpendByDay[day] || 0;
    const pace = daysInMonth > 0 ? (budget * day) / daysInMonth : 0;

    const actualKnown = isPast || day <= dayOfMonth;
    const actual = actualKnown ? cumulative : null;

    // Projection line: a dotted continuation from today's actual to the full-month
    // estimate. Only while a month is in progress, and never during days 1–5.
    let projection: number | null = null;
    if (!isPast && ctx.projectionReliable && dayOfMonth > 0 && day >= dayOfMonth) {
      const spentToday = cumulativeThrough(flexSpendByDay, dayOfMonth);
      const slope = (projected - spentToday) / (daysInMonth - dayOfMonth || 1);
      projection = spentToday + slope * (day - dayOfMonth);
    }

    points.push({ day, pace, actual, projected: projection });
  }

  return points;
}

function cumulativeThrough(spendByDay: number[], day: number): number {
  let sum = 0;
  for (let d = 0; d <= day && d < spendByDay.length; d++) sum += spendByDay[d] || 0;
  return sum;
}
