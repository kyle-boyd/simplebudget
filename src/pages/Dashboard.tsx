import { useMemo, useState, useEffect } from 'react';
import { Layout } from '@/components/layout/Layout';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis } from 'recharts';
import { useAuth } from '@/hooks/useAuth';
import { useCurrency } from '@/hooks/useUserSettings';
import { useTransactions, Transaction } from '@/hooks/useTransactions';
import { useCategories, Category } from '@/hooks/useCategories';
import {
  ALL_MONTHS,
  MONTH_NAMES,
  filterByMonth,
  monthOptions,
  parseTransactionDate,
  previousMonthLabel,
} from '@/lib/months';
import { TrendingUp, TrendingDown, Minus, ChevronLeft } from 'lucide-react';

const SELECTED_MONTH_KEY = 'selectedMonth';

const MONTH_SHORT = MONTH_NAMES.map(name => name.slice(0, 3));

interface Trend {
  direction: 'up' | 'down' | 'neutral';
  percentage: number;
  description: string;
}

const NEUTRAL_TREND = (description: string): Trend => ({
  direction: 'neutral',
  percentage: 0,
  description,
});

/**
 * Subcategories of a system category ("Hide from Budget") are excluded from all
 * spending maths. Without this they fall through to their parent, which has no
 * entry in the totals map, turning every downstream total into NaN.
 */
function hiddenCategoryNames(categories: Category[]): Set<string> {
  const hidden = new Set<string>();
  for (const category of categories) {
    if (!category.isSystem) continue;
    hidden.add(category.name.trim());
    for (const sub of category.subcategories || []) {
      hidden.add(sub.name.trim());
    }
  }
  return hidden;
}

/** Spend per top-level category, with uncategorised rolled into one bucket. */
function spendingByCategory(
  transactions: Transaction[],
  categories: Category[]
): { totals: Record<string, number>; budgets: Record<string, number> } {
  const hidden = hiddenCategoryNames(categories);
  const budgets: Record<string, number> = {};
  const totals: Record<string, number> = { Uncategorized: 0 };

  for (const category of categories) {
    if (category.isSystem) continue;
    budgets[category.name] = (category.subcategories || []).length > 0
      ? category.subcategories.reduce((sum, sub) => sum + (sub.amount || 0), 0)
      : (category.amount || 0);
    totals[category.name] = 0;
  }

  for (const transaction of transactions) {
    const name = transaction.Category?.trim();
    if (name && hidden.has(name)) continue;

    const amount = Math.abs(transaction.Amount);
    if (!Number.isFinite(amount)) continue;

    if (!name) {
      totals.Uncategorized += amount;
      continue;
    }

    const owner = categories.find(category => category.name.trim() === name)
      ?? categories.find(category =>
        (category.subcategories || []).some(sub => sub.name.trim() === name)
      );

    if (owner && !owner.isSystem && owner.name in totals) {
      totals[owner.name] += amount;
    } else if (!owner) {
      totals.Uncategorized += amount;
    }
  }

  return { totals, budgets };
}

/** Splits spend vs budget into the stacked bar segments the charts render. */
function toBarSegments<T extends object>(base: T, spent: number, budgeted: number) {
  return spent <= budgeted
    ? { ...base, spent, budgeted, spentBase: spent, remainingBudgeted: budgeted - spent, budgetedBase: 0, overage: 0 }
    : { ...base, spent, budgeted, spentBase: 0, remainingBudgeted: 0, budgetedBase: budgeted, overage: spent - budgeted };
}

function percentChange(current: number, previous: number): Trend['direction'] {
  if (current > previous) return 'up';
  if (current < previous) return 'down';
  return 'neutral';
}

/**
 * A rising line is good for categorisation progress and bad for spending, so the
 * caller says which way is better rather than every footer claiming green=up.
 */
function TrendFooter({ trend, higherIsBetter }: { trend: Trend; higherIsBetter: boolean }) {
  const TrendIcon = trend.direction === 'up' ? TrendingUp : trend.direction === 'down' ? TrendingDown : Minus;
  const isGood = trend.direction === 'neutral'
    ? null
    : (trend.direction === 'up') === higherIsBetter;
  const trendColor = isGood === null
    ? 'text-muted-foreground'
    : isGood ? 'text-green-600' : 'text-red-600';

  return (
    <div className="flex items-center justify-between w-full gap-4">
      <div className="flex items-center gap-2 min-w-0">
        <TrendIcon className={`h-4 w-4 shrink-0 ${trendColor}`} />
        <span className="font-semibold truncate">
          {trend.direction === 'up' ? 'Trending up' : trend.direction === 'down' ? 'Trending down' : 'No change'}
          {trend.percentage > 0 && ` by ${trend.percentage.toFixed(1)}%`}
        </span>
      </div>
      <span className="text-sm text-muted-foreground text-right shrink-0">{trend.description}</span>
    </div>
  );
}

export function Dashboard() {
  const { user } = useAuth();
  const { transactions } = useTransactions(user?.uid || null);
  const { categories } = useCategories(user?.uid || null);
  const { formatCurrency } = useCurrency();
  const [selectedMonth, setSelectedMonth] = useState(
    () => localStorage.getItem(SELECTED_MONTH_KEY) || ALL_MONTHS
  );
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [budgetChartPeriod, setBudgetChartPeriod] = useState('6');

  useEffect(() => {
    localStorage.setItem(SELECTED_MONTH_KEY, selectedMonth);
  }, [selectedMonth]);

  const chartConfig = {
    spent: { label: "Spent", color: "hsl(var(--chart-1))" },
    budgeted: { label: "Budgeted", color: "hsl(var(--chart-2))" },
    confirmed: { label: "Confirmed", color: "hsl(var(--chart-1))" },
    unconfirmed: { label: "Unconfirmed", color: "hsl(var(--chart-2))" },
    uncategorized: { label: "Uncategorized", color: "hsl(var(--chart-3))" },
  } satisfies ChartConfig;

  const months = useMemo(() => monthOptions(transactions), [transactions]);

  // A month saved by another page may no longer have any transactions.
  const activeMonth = months.includes(selectedMonth) ? selectedMonth : ALL_MONTHS;

  const filteredTransactions = useMemo(
    () => filterByMonth(transactions, activeMonth),
    [transactions, activeMonth]
  );

  const previousMonthTransactions = useMemo(() => {
    const previous = previousMonthLabel(activeMonth);
    return previous ? filterByMonth(transactions, previous) : [];
  }, [transactions, activeMonth]);

  // Main spending chart data
  const mainSpendingData = useMemo(() => {
    const { totals, budgets } = spendingByCategory(filteredTransactions, categories);

    return Object.keys(totals)
      .sort((a, b) => {
        if (a === 'Uncategorized') return 1;
        if (b === 'Uncategorized') return -1;
        return totals[b] - totals[a];
      })
      .map(category => toBarSegments({ category }, totals[category], budgets[category] || 0));
  }, [filteredTransactions, categories]);

  // Subcategory spending data (when a main category is selected)
  const subSpendingData = useMemo(() => {
    if (!selectedCategory) return [];

    const category = categories.find(cat => cat.name === selectedCategory);
    if (!category || (category.subcategories || []).length === 0) return [];

    const totals: Record<string, number> = {};
    const budgets: Record<string, number> = {};
    for (const sub of category.subcategories) {
      totals[sub.name] = 0;
      budgets[sub.name] = sub.amount || 0;
    }

    for (const transaction of filteredTransactions) {
      const name = transaction.Category?.trim();
      if (!name || !(name in totals)) continue;
      const amount = Math.abs(transaction.Amount);
      if (Number.isFinite(amount)) totals[name] += amount;
    }

    return Object.keys(totals)
      .sort((a, b) => totals[b] - totals[a])
      .map(name => toBarSegments({ category: name }, totals[name], budgets[name] || 0));
  }, [selectedCategory, categories, filteredTransactions]);

  const displaySpendingData = selectedCategory ? subSpendingData : mainSpendingData;

  const countsByStatus = useMemo(() => {
    const budgetCategoryNames = new Set<string>();
    for (const category of categories) {
      budgetCategoryNames.add(category.name);
      for (const sub of category.subcategories || []) budgetCategoryNames.add(sub.name);
    }

    const count = (source: Transaction[]) => {
      let confirmed = 0;
      let unconfirmed = 0;
      let uncategorized = 0;

      for (const transaction of source) {
        if (!transaction.Category || !budgetCategoryNames.has(transaction.Category)) {
          uncategorized++;
        } else if (transaction.confirmed) {
          confirmed++;
        } else {
          unconfirmed++;
        }
      }

      return { confirmed, unconfirmed, uncategorized, total: source.length };
    };

    return { current: count(filteredTransactions), previous: count(previousMonthTransactions) };
  }, [categories, filteredTransactions, previousMonthTransactions]);

  const statusData = useMemo(() => [
    { name: 'Confirmed', value: countsByStatus.current.confirmed },
    { name: 'Unconfirmed', value: countsByStatus.current.unconfirmed },
    { name: 'Uncategorized', value: countsByStatus.current.uncategorized },
  ], [countsByStatus]);

  // Budget vs actual over the trailing N months
  const yearlyData = useMemo(() => {
    const hidden = hiddenCategoryNames(categories);
    const trackedCategories = new Set<string>();
    let totalBudget = 0;

    for (const category of categories) {
      if (category.isSystem) continue;
      if ((category.subcategories || []).length === 0) {
        trackedCategories.add(category.name.trim().toLowerCase());
        totalBudget += category.amount || 0;
      } else {
        for (const sub of category.subcategories) {
          trackedCategories.add(sub.name.trim().toLowerCase());
          totalBudget += sub.amount || 0;
        }
      }
    }

    const today = new Date();
    const numMonths = parseInt(budgetChartPeriod) || 6;
    const window: { year: number; month: number; label: string }[] = [];

    for (let i = numMonths - 1; i >= 0; i--) {
      const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
      window.push({
        year: date.getFullYear(),
        month: date.getMonth(),
        label: `${MONTH_SHORT[date.getMonth()]} '${String(date.getFullYear()).slice(-2)}`,
      });
    }

    const spendByMonth = new Map<string, number>(window.map(({ year, month }) => [`${year}-${month}`, 0]));

    for (const transaction of transactions) {
      const name = transaction.Category?.trim();
      if (!name || hidden.has(name)) continue;
      if (!trackedCategories.has(name.toLowerCase())) continue;

      const date = parseTransactionDate(transaction.Date);
      if (!date) continue;

      const key = `${date.getFullYear()}-${date.getMonth()}`;
      const running = spendByMonth.get(key);
      if (running === undefined) continue;

      const amount = Math.abs(transaction.Amount);
      if (Number.isFinite(amount)) spendByMonth.set(key, running + amount);
    }

    return window.map(({ year, month, label }) =>
      toBarSegments({ month: label }, spendByMonth.get(`${year}-${month}`) || 0, totalBudget)
    );
  }, [categories, transactions, budgetChartPeriod]);

  /**
   * Compares the last two bars of the trailing window. Indexing this array by
   * the calendar month number instead, as it used to, reads past the end of a
   * 3- or 6-month window and always reported "insufficient data".
   */
  const yearlyTrend = useMemo<Trend>(() => {
    if (yearlyData.length < 2) return NEUTRAL_TREND('Insufficient data');

    const current = yearlyData[yearlyData.length - 1];
    const previous = yearlyData[yearlyData.length - 2];

    if (previous.spent === 0) return NEUTRAL_TREND(`No spending in ${previous.month}`);

    return {
      direction: percentChange(current.spent, previous.spent),
      percentage: Math.abs(((current.spent - previous.spent) / previous.spent) * 100),
      description: `Compared to ${previous.month}`,
    };
  }, [yearlyData]);

  const categorizationTrend = useMemo<Trend>(() => {
    if (transactions.length === 0) return NEUTRAL_TREND('No data available');
    if (activeMonth === ALL_MONTHS) return NEUTRAL_TREND('Showing all transactions');

    const { current, previous } = countsByStatus;
    if (previous.total === 0) return NEUTRAL_TREND('No previous period data');

    const currentRate = current.total > 0 ? (current.confirmed / current.total) * 100 : 0;
    const previousRate = (previous.confirmed / previous.total) * 100;
    if (previousRate === 0) return NEUTRAL_TREND('No previous confirmed transactions');

    return {
      direction: percentChange(currentRate, previousRate),
      percentage: Math.abs(currentRate - previousRate),
      description: 'Compared to previous month',
    };
  }, [transactions.length, activeMonth, countsByStatus]);

  const monthlySpendingTrend = useMemo<Trend>(() => {
    if (mainSpendingData.length === 0) return NEUTRAL_TREND('No data available');
    if (activeMonth === ALL_MONTHS) return NEUTRAL_TREND('Showing all months');
    if (previousMonthTransactions.length === 0) return NEUTRAL_TREND('No previous month data');

    const currentTotal = mainSpendingData.reduce((sum, item) => sum + item.spent, 0);
    const { totals } = spendingByCategory(previousMonthTransactions, categories);
    const previousTotal = Object.values(totals).reduce((sum, value) => sum + value, 0);

    if (previousTotal === 0) return NEUTRAL_TREND('No previous spending');

    return {
      direction: percentChange(currentTotal, previousTotal),
      percentage: Math.abs(((currentTotal - previousTotal) / previousTotal) * 100),
      description: 'Compared to previous month',
    };
  }, [mainSpendingData, activeMonth, previousMonthTransactions, categories]);

  return (
    <Layout>
      <div className="flex flex-col lg:h-[calc(100vh-1.5rem-4rem-1.5rem)]">
        <div className="sticky top-0 lg:top-0 z-10 h-auto lg:h-16 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 lg:gap-0 bg-background border-b -mx-4 lg:-mx-6 px-4 lg:px-6 py-4 lg:py-0 flex-shrink-0">
          <h1 className="font-medium">Dashboard</h1>
          <Select value={activeMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-full lg:w-[180px]">
              <SelectValue placeholder="Select month" />
            </SelectTrigger>
            <SelectContent>
              {months.map(month => (
                <SelectItem key={month} value={month}>{month}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-6 lg:flex-1 lg:min-h-0 mt-6">
          <div className="lg:flex-1 lg:min-h-0">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:items-stretch lg:h-full">
            <Card className="flex flex-col md:col-span-2 shadow-none overflow-hidden">
              <CardHeader className="flex-shrink-0">
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                  <div>
                    <CardTitle>Budget vs Actual</CardTitle>
                    <CardDescription>
                      {budgetChartPeriod === '3'
                        ? 'Showing last 3 months'
                        : budgetChartPeriod === '6'
                        ? 'Showing last 6 months'
                        : 'Showing last 12 months'}
                    </CardDescription>
                  </div>
                  <Select value={budgetChartPeriod} onValueChange={setBudgetChartPeriod}>
                    <SelectTrigger className="w-full lg:w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="3">Last 3 months</SelectItem>
                      <SelectItem value="6">Last 6 months</SelectItem>
                      <SelectItem value="12">Last 12 months</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="flex-1 lg:min-h-0 overflow-hidden">
                <ChartContainer config={chartConfig} className="h-[250px] lg:h-full w-full">
                  <BarChart
                    data={yearlyData}
                    barSize={40}
                  >
                    <XAxis
                      dataKey="month"
                      tickLine={false}
                      axisLine={true}
                    />
                    <YAxis axisLine={false} tickLine={false} />
                    <ChartTooltip 
                      content={({ active, payload }) => {
                        if (!active || !payload || payload.length === 0) return null;
                        
                        const data = payload[0].payload;
                        const spent = data.spent || 0;
                        const budgeted = data.budgeted || 0;
                        
                        return (
                          <div className="rounded-lg border bg-background p-2 shadow-sm">
                            <div className="grid gap-2">
                              <div className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-2">
                                  <div className="w-3 h-3 rounded" style={{ backgroundColor: '#f5f5f5', border: '1px solid #d1d1d1' }} />
                                  <span className="text-sm font-medium">Budgeted</span>
                                </div>
                                <span className="text-sm font-mono">{formatCurrency(budgeted)}</span>
                              </div>
                              <div className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-2">
                                  <div className="w-3 h-3 rounded" style={{ backgroundColor: spent > budgeted ? 'hsl(0, 84%, 60%)' : 'hsl(220, 13%, 18%)' }} />
                                  <span className="text-sm font-medium">Spent</span>
                                </div>
                                <span className="text-sm font-mono">{formatCurrency(spent)}</span>
                              </div>
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Bar 
                      dataKey="spentBase" 
                      stackId="budget" 
                      fill="hsl(220, 13%, 18%)"
                      radius={[0, 0, 4, 4]}
                      legendType="none"
                    />
                    <Bar
                      dataKey="remainingBudgeted"
                      stackId="budget"
                      fill="#f5f5f5"
                      stroke="#d1d1d1"
                      strokeWidth={1}
                      radius={[4, 4, 0, 0]}
                      legendType="none"
                    />
                    <Bar
                      dataKey="budgetedBase"
                      stackId="budget"
                      fill="hsl(0, 70%, 85%)"
                      stroke="#d1d1d1"
                      strokeWidth={1}
                      radius={[0, 0, 4, 4]}
                      legendType="none"
                    />
                    <Bar
                      dataKey="overage"
                      stackId="budget"
                      fill="hsl(0, 84%, 60%)"
                      radius={[4, 4, 0, 0]}
                      legendType="none"
                    />
                  </BarChart>
                </ChartContainer>
              </CardContent>
              <CardFooter className="flex-shrink-0 border-t pt-4">
                <TrendFooter trend={yearlyTrend} higherIsBetter={false} />
              </CardFooter>
            </Card>

            <Card className="flex flex-col md:col-span-1 shadow-none overflow-hidden">
              <CardHeader className="flex-shrink-0">
                <CardTitle>Categorization Progress</CardTitle>
                <CardDescription>{activeMonth === ALL_MONTHS ? 'All Months Average' : activeMonth.replace(', ', ' ')}</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 lg:min-h-0 overflow-hidden">
                <div className="relative h-[250px] lg:h-full w-full">
                  <ChartContainer config={chartConfig} className="h-full w-full">
                    <PieChart margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                      <Pie
                        data={statusData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={65}
                        outerRadius={90}
                      >
                        {statusData.map((entry, index) => {
                          let fillColor;
                          if (entry.name === 'Uncategorized') {
                            fillColor = 'hsl(0, 84%, 60%)'; // red
                          } else if (entry.name === 'Unconfirmed') {
                            fillColor = '#d1d1d1'; // light gray
                          } else {
                            const colorKey = entry.name.toLowerCase().replace(/\s+/g, '');
                            fillColor = `var(--color-${colorKey})`;
                          }
                          return (
                            <Cell key={`cell-${index}`} fill={fillColor} />
                          );
                        })}
                      </Pie>
                      <ChartTooltip content={<ChartTooltipContent />} />
                    </PieChart>
                  </ChartContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-2xl font-semibold">
                      {statusData.reduce((sum, entry) => sum + entry.value, 0)}
                    </span>
                    <span className="text-sm text-muted-foreground mt-1">
                      Total Transactions
                    </span>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex-shrink-0 border-t pt-4">
                <TrendFooter trend={categorizationTrend} higherIsBetter />
              </CardFooter>
            </Card>
            </div>
          </div>

          <Card className="flex flex-col lg:flex-1 lg:min-h-0 shadow-none overflow-hidden">
            <CardHeader className="flex-shrink-0">
              <CardTitle className="flex items-center gap-2">
                {selectedCategory && (
                  <button
                    onClick={() => setSelectedCategory(null)}
                    className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                )}
                Monthly Spending by Category
                {selectedCategory && (
                  <span className="text-muted-foreground font-normal">
                    &rsaquo; {selectedCategory}
                  </span>
                )}
              </CardTitle>
              <CardDescription>{activeMonth === ALL_MONTHS ? 'All Months Average' : activeMonth.replace(', ', ' ')}</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 lg:min-h-0 overflow-hidden">
              <ChartContainer config={chartConfig} className="h-[300px] lg:h-full w-full">
                <BarChart
                  data={displaySpendingData}
                  layout="vertical"
                  barSize={40}
                  onClick={(data) => {
                    if (selectedCategory) return;
                    if (data?.activePayload?.[0]?.payload) {
                      const { category } = data.activePayload[0].payload;
                      const cat = categories.find(c => c.name === category);
                      if (cat && cat.subcategories.length > 0) {
                        setSelectedCategory(category);
                      }
                    }
                  }}
                  style={{ cursor: selectedCategory ? 'default' : 'pointer' }}
                >
                  <XAxis type="number" axisLine={false} tickLine={false} />
                  <YAxis
                    dataKey="category"
                    type="category"
                    width={120}
                    tickLine={false}
                    axisLine={true}
                  />
                  <ChartTooltip 
                    content={({ active, payload }) => {
                      if (!active || !payload || payload.length === 0) return null;
                      
                      const data = payload[0].payload;
                      const spent = data.spent || 0;
                      const budgeted = data.budgeted || 0;
                      
                      return (
                        <div className="rounded-lg border bg-background p-2 shadow-sm">
                          <div className="grid gap-2">
                            <span className="text-sm font-semibold">{data.category}</span>
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded" style={{ backgroundColor: '#f5f5f5', border: '1px solid #d1d1d1' }} />
                                <span className="text-sm font-medium">Budgeted</span>
                              </div>
                              <span className="text-sm font-mono">{formatCurrency(budgeted)}</span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded" style={{ backgroundColor: spent > budgeted ? 'hsl(0, 84%, 60%)' : 'hsl(220, 13%, 18%)' }} />
                                <span className="text-sm font-medium">Spent</span>
                              </div>
                              <span className="text-sm font-mono">{formatCurrency(spent)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Bar 
                    dataKey="spentBase" 
                    stackId="budget" 
                    fill="hsl(220, 13%, 18%)"
                    legendType="none"
                  />
                  <Bar 
                    dataKey="remainingBudgeted" 
                    stackId="budget" 
                    fill="#f5f5f5"
                    stroke="#d1d1d1"
                    strokeWidth={1}
                    radius={[0, 4, 4, 0]}
                    legendType="none"
                  />
                  <Bar
                    dataKey="budgetedBase"
                    stackId="budget"
                    fill="hsl(0, 70%, 85%)"
                    stroke="#d1d1d1"
                    strokeWidth={1}
                    legendType="none"
                  />
                  <Bar
                    dataKey="overage"
                    stackId="budget"
                    fill="hsl(0, 84%, 60%)"
                    radius={[0, 4, 4, 0]}
                    legendType="none"
                  />
                </BarChart>
              </ChartContainer>
            </CardContent>
            <CardFooter className="flex-shrink-0 border-t pt-4">
              <TrendFooter trend={monthlySpendingTrend} higherIsBetter={false} />
            </CardFooter>
          </Card>
        </div>
      </div>
    </Layout>
  );
}

