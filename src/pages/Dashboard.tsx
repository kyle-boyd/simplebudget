import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  ReferenceLine,
  LabelList,
  ResponsiveContainer,
} from 'recharts';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useCurrency } from '@/hooks/useUserSettings';
import { useTransactions } from '@/hooks/useTransactions';
import { useCategories } from '@/hooks/useCategories';
import { MONTH_NAMES, parseMonthLabel } from '@/lib/months';
import {
  currentMonthSelection,
  isAfter,
  monthContext,
  shiftMonth,
  summarizeMonth,
  type CategorySummary,
  type DashboardData,
  type MonthSelection,
  type Note,
} from '@/lib/dashboard';

const SELECTED_MONTH_KEY = 'selectedMonth';

/** The label format shared with Budget/Transactions via localStorage, e.g. `October, 2026`. */
function toMonthLabel({ year, month }: MonthSelection): string {
  return `${MONTH_NAMES[month]}, ${year}`;
}

function readStoredSelection(now: Date): MonthSelection {
  const stored = localStorage.getItem(SELECTED_MONTH_KEY);
  const parsed = stored ? parseMonthLabel(stored) : null;
  return parsed ?? currentMonthSelection(now);
}

export function Dashboard() {
  const { user } = useAuth();
  const { transactions } = useTransactions(user?.uid || null);
  const { categories } = useCategories(user?.uid || null);
  const { formatCurrency } = useCurrency();

  const now = useMemo(() => new Date(), []);
  const [selection, setSelection] = useState<MonthSelection>(() => readStoredSelection(now));

  useEffect(() => {
    localStorage.setItem(SELECTED_MONTH_KEY, toMonthLabel(selection));
  }, [selection]);

  const data = useMemo(
    () => summarizeMonth(transactions, categories, monthContext(selection, now)),
    [transactions, categories, selection, now]
  );

  // Whole dollars read better on a glanceable page; the cents never change a decision here.
  const money = (amount: number) => formatCurrency(Math.round(amount)).replace(/\.00$/, '');

  const todaySelection = currentMonthSelection(now);
  const canGoNext = isAfter(todaySelection, selection);
  const isThisMonth = data.ctx.isCurrent;

  return (
    <Layout>
      <div className="font-sb tabular-nums text-sb-text bg-sb-ground -mx-4 lg:-mx-6 px-4 lg:px-6 py-6 min-h-full">
        <div className="mx-auto w-full max-w-5xl space-y-6">
          <DashboardHeader
            ctx={data.ctx}
            isThisMonth={isThisMonth}
            canGoNext={canGoNext}
            onPrev={() => setSelection(shiftMonth(selection, -1))}
            onNext={() => canGoNext && setSelection(shiftMonth(selection, 1))}
            onThisMonth={() => setSelection(todaySelection)}
          />

          <TodoRow uncategorized={data.uncategorized} money={money} />

          <HeroCard data={data} money={money} />

          <CategoryGrid categories={data.categories} ctx={data.ctx} money={money} />
        </div>
      </div>
    </Layout>
  );
}

// --- header -----------------------------------------------------------------

interface HeaderProps {
  ctx: DashboardData['ctx'];
  isThisMonth: boolean;
  canGoNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onThisMonth: () => void;
}

function DashboardHeader({ ctx, isThisMonth, canGoNext, onPrev, onNext, onThisMonth }: HeaderProps) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="text-sm font-medium text-sb-muted">
          {ctx.year}
          {ctx.isCurrent && <> · Day {ctx.dayOfMonth} of {ctx.daysInMonth}</>}
        </div>
        <h1 className="mt-0.5 text-[34px] font-bold leading-[1.1] tracking-tight">{MONTH_NAMES[ctx.month]}</h1>
      </div>

      <div className="inline-flex items-center rounded-sb border border-sb-hairline bg-sb-surface p-1" role="group" aria-label="Choose month">
        <Button
          variant="ghost"
          onClick={onPrev}
          aria-label="Previous month"
          className="h-11 w-11 p-0 text-sb-text hover:bg-sb-ground"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          onClick={onThisMonth}
          disabled={isThisMonth}
          aria-pressed={isThisMonth}
          className="h-11 px-4 text-sb-text hover:bg-sb-ground disabled:opacity-100 disabled:font-semibold"
        >
          This month
        </Button>
        <Button
          variant="ghost"
          onClick={onNext}
          disabled={!canGoNext}
          aria-label="Next month"
          className="h-11 w-11 p-0 text-sb-text hover:bg-sb-ground"
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
}

// --- to-do row --------------------------------------------------------------

function TodoRow({
  uncategorized,
  money,
}: {
  uncategorized: DashboardData['uncategorized'];
  money: (n: number) => string;
}) {
  if (uncategorized.count === 0) {
    return (
      <div className="flex items-center gap-3 rounded-sb border border-sb-hairline bg-sb-surface px-4 py-3">
        <Check className="h-5 w-5 text-sb-positive" aria-hidden />
        <span className="font-medium text-sb-positive-text">All caught up</span>
        <span className="text-sb-muted">Every transaction this month has a category.</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-sb border border-sb-hairline bg-sb-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span
          className="h-2 w-2 shrink-0 rounded-full bg-sb-over"
          style={{ boxShadow: '0 0 0 4px var(--sb-over-bg)' }}
          aria-hidden
        />
        <span>
          <strong className="font-semibold">
            {uncategorized.count} transaction{uncategorized.count === 1 ? '' : 's'}
          </strong>{' '}
          need{uncategorized.count === 1 ? 's' : ''} a category
        </span>
        <span className="text-sb-muted">{money(uncategorized.amount)} not counted</span>
      </div>
      <Button asChild className="h-11 rounded-[10px] bg-sb-text px-4 text-sb-surface hover:bg-sb-text/90">
        <Link to="/transactions">Categorize</Link>
      </Button>
    </div>
  );
}

// --- hero --------------------------------------------------------------------

function HeroCard({ data, money }: { data: DashboardData; money: (n: number) => string }) {
  const { hero, ctx, fixedBills } = data;
  const { badge, headline, explanation, tone } = heroCopy(data, money);

  const badgeClass =
    tone === 'over'
      ? 'bg-sb-over-bg text-sb-over-text'
      : tone === 'positive'
      ? 'bg-sb-positive-bg text-sb-positive-text'
      : 'bg-sb-ground text-sb-muted';

  const dotColor = tone === 'over' ? 'var(--sb-over)' : tone === 'positive' ? 'var(--sb-positive)' : 'var(--sb-muted)';

  return (
    <section
      className="rounded-sb border border-sb-hairline bg-sb-surface p-6 sm:p-7 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_8px_24px_rgba(0,0,0,0.03)]"
      aria-labelledby="hero-heading"
    >
      <div className="flex flex-col flex-wrap items-start justify-between gap-6 sm:flex-row">
        <div className="flex-1 basis-[340px]">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-sb-muted">Flexible spending</span>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${badgeClass}`}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: dotColor }} aria-hidden />
              {badge}
            </span>
          </div>
          <h2
            id="hero-heading"
            className={`mt-2.5 text-[40px] font-bold leading-[1.05] tracking-tight ${tone === 'over' ? 'text-sb-over-text' : 'text-sb-text'}`}
          >
            {headline}
          </h2>
          {explanation && <p className="mt-2.5 text-[15px] leading-snug text-sb-muted">{explanation}</p>}
        </div>

        <div className="flex rounded-[14px] border border-sb-hairline bg-sb-ground">
          <Stat label="Per day left" value={ctx.dayOfMonth < ctx.daysInMonth ? money(hero.perDayLeft) : '—'} />
          <Stat label="Spent" value={money(hero.spent)} divider />
          <Stat label="Budget" value={money(hero.budget)} muted divider />
        </div>
      </div>

      <BurnUpChart data={data} money={money} />

      <div className="mt-1.5 flex items-center justify-end border-t border-sb-hairline pt-3.5 text-sm text-sb-muted">
        <span className="mr-2 h-1.5 w-1.5 rounded-full bg-sb-positive" aria-hidden />
        Fixed bills&nbsp;<span className="font-semibold text-sb-text">{money(fixedBills.paid)}</span>&nbsp;of {money(fixedBills.total)}&nbsp;
        <span className="font-semibold text-sb-positive-text">paid</span>
      </div>
    </section>
  );
}

function Stat({ label, value, muted, divider }: { label: string; value: string; muted?: boolean; divider?: boolean }) {
  return (
    <div className={`min-w-[104px] px-5 py-3.5 ${divider ? 'border-l border-sb-hairline' : ''}`}>
      <div className="text-xs font-medium text-sb-muted">{label}</div>
      <div className={`mt-1 text-[26px] font-bold leading-none ${muted ? 'text-sb-muted' : 'text-sb-text'}`}>{value}</div>
    </div>
  );
}

type HeroTone = 'over' | 'positive' | 'neutral';

function heroCopy(
  data: DashboardData,
  money: (n: number) => string
): { badge: string; headline: string; explanation: string; tone: HeroTone } {
  const { hero, ctx } = data;

  if (ctx.isPast) {
    if (hero.budget > 0 && hero.spent > hero.budget) {
      return {
        badge: 'Over budget',
        tone: 'over',
        headline: `Finished ${money(hero.spent - hero.budget)} over`,
        explanation: `Spent ${money(hero.spent)} of ${money(hero.budget)} on flexible spending.`,
      };
    }
    return {
      badge: 'On budget',
      tone: 'positive',
      headline: `Finished ${money(Math.max(hero.budget - hero.spent, 0))} under`,
      explanation: `Spent ${money(hero.spent)} of ${money(hero.budget)} on flexible spending.`,
    };
  }

  if (!ctx.projectionReliable) {
    return {
      badge: 'Too early to tell',
      tone: 'neutral',
      headline: hero.vsPace > 0 ? 'Running a little ahead' : 'On pace so far',
      explanation: `Too early to project — only day ${ctx.dayOfMonth} of ${ctx.daysInMonth}.`,
    };
  }

  if (hero.overPace) {
    const drivers = hero.drivers.length
      ? `${hero.drivers.join(' and ')} ${hero.drivers.length === 1 ? 'is' : 'are'} driving it.`
      : '';
    return {
      badge: 'Over pace',
      tone: 'over',
      headline: `Headed ${money(hero.projected - hero.budget)} over`,
      explanation: `At this rate you'll spend ${money(hero.projected)} of ${money(hero.budget)}. ${drivers}`.trim(),
    };
  }

  return {
    badge: 'On pace',
    tone: 'positive',
    headline: `On track — ${money(Math.max(hero.budget - hero.projected, 0))} to spare`,
    explanation: `At this rate you'll spend ${money(hero.projected)} of ${money(hero.budget)}.`,
  };
}

// --- burn-up chart -----------------------------------------------------------

function BurnUpChart({ data, money }: { data: DashboardData; money: (n: number) => string }) {
  const { burnUp, hero, ctx } = data;
  const graphite = 'var(--sb-graphite)';
  const muted = 'var(--sb-muted)';
  const projectionColor = hero.overPace ? 'var(--sb-over)' : 'var(--sb-graphite)';

  const lastActualDay = ctx.isPast ? ctx.daysInMonth : ctx.dayOfMonth;
  const showProjection = !ctx.isPast && ctx.projectionReliable && ctx.dayOfMonth > 0;
  const showToday = ctx.isCurrent && ctx.dayOfMonth > 0 && ctx.dayOfMonth < ctx.daysInMonth;

  const label =
    `Cumulative flexible spending for ${MONTH_NAMES[ctx.month]}. ` +
    `Spent ${money(hero.spent)} of ${money(hero.budget)} budget` +
    (ctx.isPast
      ? '.'
      : `, ${hero.vsPace >= 0 ? money(hero.vsPace) + ' ahead of' : money(-hero.vsPace) + ' behind'} pace, ` +
        (ctx.projectionReliable ? `projected ${money(hero.projected)} by month end.` : 'too early to project.'));

  // Recharts types the LabelList content props loosely (x/y can be string|number);
  // we only draw at one point per line, so coerce and guard.
  const endLabel = (text: string, color: string, day: number) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (props: any) => {
      if (props.index !== day || props.x == null || props.y == null) return null;
      return (
        <text x={Number(props.x)} y={Number(props.y)} dy={-6} dx={-2} textAnchor="end" fontSize={12} fontWeight={600} fill={color}>
          {text}
        </text>
      );
    };

  return (
    <figure className="m-0" role="img" aria-label={label}>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={burnUp} margin={{ top: 16, right: 64, bottom: 8, left: 8 }}>
            <XAxis
              dataKey="day"
              type="number"
              domain={[0, ctx.daysInMonth]}
              ticks={[1, Math.round(ctx.daysInMonth / 2), ctx.daysInMonth]}
              tickLine={false}
              axisLine={{ stroke: 'var(--sb-hairline)' }}
              tick={{ fontSize: 11, fill: muted }}
            />
            <YAxis hide domain={[0, 'auto']} />

            {showToday && (
              <ReferenceLine
                x={ctx.dayOfMonth}
                stroke={muted}
                strokeDasharray="2 2"
                label={{
                  value: `Today · ${hero.vsPace >= 0 ? '+' : '−'}${money(Math.abs(hero.vsPace))} vs pace`,
                  position: 'insideTopLeft',
                  fontSize: 11,
                  fill: hero.vsPace > 0 ? 'var(--sb-over-text)' : muted,
                }}
              />
            )}

            {/* Soft fill under the actual spend. */}
            <Area
              type="monotone"
              dataKey="actual"
              stroke="none"
              fill={graphite}
              fillOpacity={0.06}
              connectNulls={false}
              isAnimationActive={false}
            />

            {/* Budget-pace line: straight $0 → budget. */}
            <Line
              type="linear"
              dataKey="pace"
              stroke={muted}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            >
              <LabelList content={endLabel(`${money(hero.budget)} budget`, muted, ctx.daysInMonth)} />
            </Line>

            {/* Actual cumulative spend through today. */}
            <Line
              type="monotone"
              dataKey="actual"
              stroke={graphite}
              strokeWidth={2.5}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            >
              <LabelList content={endLabel(`${money(hero.spent)} spent`, graphite, lastActualDay)} />
            </Line>

            {/* Dotted projection from today to month end. */}
            {showProjection && (
              <Line
                type="linear"
                dataKey="projected"
                stroke={projectionColor}
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
                connectNulls
                isAnimationActive={false}
              >
                <LabelList content={endLabel(`${money(hero.projected)} projected`, projectionColor, ctx.daysInMonth)} />
              </Line>
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

// --- category cards ----------------------------------------------------------

function CategoryGrid({
  categories,
  ctx,
  money,
}: {
  categories: CategorySummary[];
  ctx: DashboardData['ctx'];
  money: (n: number) => string;
}) {
  if (categories.length === 0) return null;

  return (
    <section aria-labelledby="categories-heading">
      <div className="mx-0.5 mb-3 mt-2 flex items-baseline justify-between gap-3">
        <h2 id="categories-heading" className="text-xl font-bold tracking-tight">Categories</h2>
        <span className="text-xs text-sb-muted">
          Riskiest first{ctx.isCurrent ? ' · tick = today’s pace' : ''}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map(category => (
          <CategoryCard key={category.name} category={category} ctx={ctx} money={money} />
        ))}
      </div>
    </section>
  );
}

function CategoryCard({
  category,
  ctx,
  money,
}: {
  category: CategorySummary;
  ctx: DashboardData['ctx'];
  money: (n: number) => string;
}) {
  const { spent, budget, overPace } = category;
  const spentPct = budget > 0 ? Math.min((spent / budget) * 100, 100) : spent > 0 ? 100 : 0;
  const pacePct = budget > 0 && !ctx.isPast ? Math.min((ctx.dayOfMonth / ctx.daysInMonth) * 100, 100) : null;
  const barColor = overPace ? 'bg-sb-over' : 'bg-sb-graphite';

  return (
    <div className="flex flex-col gap-2.5 rounded-[16px] border border-sb-hairline bg-sb-surface p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      <div className="flex min-h-[22px] items-center justify-between gap-2">
        <span className="text-sm font-semibold">{category.name}</span>
        {overPace && !ctx.isPast && category.perDayLeft > 0 && (
          <span className="inline-flex h-[22px] items-center rounded-full bg-sb-over-bg px-2 text-[11px] font-semibold text-sb-over-text">
            {money(category.perDayLeft)}/day left
          </span>
        )}
      </div>

      <div className="text-[22px] font-bold leading-none">
        {money(spent)}
        <span className="text-[13px] font-medium text-sb-muted"> of {money(budget)}</span>
      </div>

      <div className="relative h-1.5 w-full rounded-full bg-sb-ground">
        <div className={`h-1.5 rounded-full ${barColor}`} style={{ width: `${spentPct}%` }} />
        {pacePct !== null && (
          <span
            className="absolute -top-[3px] -bottom-[3px] w-0.5 -ml-px rounded-sm bg-sb-text shadow-[0_0_0_1.5px_#fff]"
            style={{ left: `${pacePct}%` }}
            aria-hidden
          />
        )}
      </div>

      <div className={`text-xs font-medium ${noteTone(category.note)}`}>{noteText(category.note, money)}</div>
    </div>
  );
}

function noteTone(note: Note): string {
  if (note.kind === 'over' || note.kind === 'final-over') return 'text-sb-over-text';
  if (note.kind === 'spare' || note.kind === 'final-under' || note.kind === 'on' || note.kind === 'final-on')
    return 'text-sb-positive-text';
  return 'text-sb-muted';
}

function noteText(note: Note, money: (n: number) => string): string {
  switch (note.kind) {
    case 'too-early':
      return 'Too early to project';
    case 'over':
      return `Headed for ${money(note.amount)}`;
    case 'on':
    case 'final-on':
      return 'On pace';
    case 'spare':
      return `${money(note.amount)} to spare`;
    case 'final-over':
      return `${money(note.amount)} over budget`;
    case 'final-under':
      return `${money(note.amount)} under budget`;
    case 'no-budget':
      return note.amount > 0 ? `${money(note.amount)} spent · no budget set` : 'No budget set';
  }
}
