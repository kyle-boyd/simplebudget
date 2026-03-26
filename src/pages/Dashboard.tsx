import { useState, useEffect } from 'react';
import { Layout } from '@/components/layout/Layout';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis } from 'recharts';
import { useAuth } from '@/hooks/useAuth';
import { useTransactions } from '@/hooks/useTransactions';
import { useCategories } from '@/hooks/useCategories';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

const SELECTED_MONTH_KEY = 'selectedMonth';

export function Dashboard() {
  const { user } = useAuth();
  const { transactions } = useTransactions(user?.uid || null);
  const { categories } = useCategories(user?.uid || null);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    // Initialize from localStorage if available
    return localStorage.getItem(SELECTED_MONTH_KEY) || 'All Months';
  });

  // Save to localStorage whenever selectedMonth changes
  useEffect(() => {
    localStorage.setItem(SELECTED_MONTH_KEY, selectedMonth);
  }, [selectedMonth]);

  const chartConfig = {
    spent: {
      label: "Spent",
      color: "hsl(var(--chart-1))",
    },
    budgeted: {
      label: "Budgeted",
      color: "hsl(var(--chart-2))",
    },
    confirmed: {
      label: "Confirmed",
      color: "hsl(var(--chart-1))",
    },
    unconfirmed: {
      label: "Unconfirmed",
      color: "hsl(var(--chart-2))",
    },
    uncategorized: {
      label: "Uncategorized",
      color: "hsl(var(--chart-3))",
    },
  } satisfies ChartConfig;

  // Get unique months from transactions
  const months = ['All Months', ...new Set(
    transactions.map(t => {
      const [month, , year] = t.Date.split('/');
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
        'July', 'August', 'September', 'October', 'November', 'December'];
      return `${monthNames[parseInt(month) - 1]}, 20${year}`;
    })
  )];

  const filteredTransactions = selectedMonth === 'All Months'
    ? transactions
    : transactions.filter(t => {
        const [monthName, year] = selectedMonth.split(', ');
        const monthIndex = ['January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December']
          .indexOf(monthName) + 1;
        const [tMonth, , tYear] = t.Date.split('/');
        return parseInt(tMonth) === monthIndex && tYear === year.slice(-2);
      });

  // Helper function to get date range string
  const getDateRange = (transactions: typeof filteredTransactions) => {
    if (transactions.length === 0) return 'No data available';
    
    const dates = transactions.map(t => {
      const [month, day, year] = t.Date.split('/');
      return new Date(2000 + parseInt(year), parseInt(month) - 1, parseInt(day));
    }).sort((a, b) => a.getTime() - b.getTime());
    
    const startDate = dates[0];
    const endDate = dates[dates.length - 1];
    
    const formatDate = (date: Date) => {
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${monthNames[date.getMonth()]} ${date.getDate()}, 20${date.getFullYear() % 100}`;
    };
    
    if (startDate.getTime() === endDate.getTime()) {
      return formatDate(startDate);
    }
    return `${formatDate(startDate)} - ${formatDate(endDate)}`;
  };

  // Helper function to calculate trend for yearly chart
  const getYearlyTrend = () => {
    if (yearlyData.length < 2) return { direction: 'neutral', percentage: 0, description: 'Insufficient data' };
    
    const currentMonth = new Date().getMonth();
    const currentSpent = yearlyData[currentMonth]?.spent || 0;
    const previousMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const previousSpent = yearlyData[previousMonth]?.spent || 0;
    
    if (previousSpent === 0) return { direction: 'neutral', percentage: 0, description: 'No previous data' };
    
    const change = ((currentSpent - previousSpent) / previousSpent) * 100;
    const direction = change > 0 ? 'up' : change < 0 ? 'down' : 'neutral';
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    return {
      direction,
      percentage: Math.abs(change),
      description: `Compared to ${monthNames[previousMonth]}`
    };
  };

  // Helper function to calculate trend for categorization chart
  const getCategorizationTrend = () => {
    if (transactions.length === 0) return { direction: 'neutral', percentage: 0, description: 'No data available' };
    
    const currentConfirmed = statusData.find(s => s.name === 'Confirmed')?.value || 0;
    const currentTotal = statusData.reduce((sum, s) => sum + s.value, 0);
    const currentPercentage = currentTotal > 0 ? (currentConfirmed / currentTotal) * 100 : 0;
    
    // Get previous period data (previous month or all months before current selection)
    let previousTransactions: typeof transactions = [];
    if (selectedMonth === 'All Months') {
      // For "All Months", compare with nothing (neutral)
      return { direction: 'neutral', percentage: 0, description: 'Showing all transactions' };
    } else {
      // Get previous month's transactions
      const [monthName, year] = selectedMonth.split(', ');
      const monthIndex = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December']
        .indexOf(monthName);
      
      let prevMonthIndex = monthIndex - 1;
      let prevYear = parseInt(year.slice(-2));
      if (prevMonthIndex < 0) {
        prevMonthIndex = 11;
        prevYear -= 1;
      }
      
      previousTransactions = transactions.filter(t => {
        const [tMonth, , tYear] = t.Date.split('/');
        const tMonthIndex = parseInt(tMonth) - 1;
        return tMonthIndex === prevMonthIndex && tYear === prevYear.toString().padStart(2, '0');
      });
    }
    
    if (previousTransactions.length === 0) {
      return { direction: 'neutral', percentage: 0, description: 'No previous period data' };
    }
    
    const budgetCategoryNames = new Set<string>();
    categories.forEach(cat => {
      budgetCategoryNames.add(cat.name);
      cat.subcategories.forEach(sub => budgetCategoryNames.add(sub.name));
    });
    
    const prevConfirmed = previousTransactions.filter(t => 
      t.Category && budgetCategoryNames.has(t.Category) && t.confirmed
    ).length;
    const prevTotal = previousTransactions.length;
    const prevPercentage = prevTotal > 0 ? (prevConfirmed / prevTotal) * 100 : 0;
    
    if (prevPercentage === 0) return { direction: 'neutral', percentage: 0, description: 'No previous confirmed transactions' };
    
    const change = currentPercentage - prevPercentage;
    const direction = change > 0 ? 'up' : change < 0 ? 'down' : 'neutral';
    
    return {
      direction,
      percentage: Math.abs(change),
      description: 'Compared to previous month'
    };
  };

  // Helper function to calculate trend for monthly spending chart
  const getMonthlySpendingTrend = () => {
    if (mainSpendingData.length === 0) return { direction: 'neutral', percentage: 0, description: 'No data available' };
    
    const currentTotal = mainSpendingData.reduce((sum, item) => sum + item.spent, 0);
    
    if (selectedMonth === 'All Months') {
      return { direction: 'neutral', percentage: 0, description: 'Showing all months' };
    }
    
    // Get previous month's data
    const [monthName, year] = selectedMonth.split(', ');
    const monthIndex = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December']
      .indexOf(monthName);
    
    let prevMonthIndex = monthIndex - 1;
    let prevYear = parseInt(year.slice(-2));
    if (prevMonthIndex < 0) {
      prevMonthIndex = 11;
      prevYear -= 1;
    }
    
    const prevTransactions = transactions.filter(t => {
      const [tMonth, , tYear] = t.Date.split('/');
      const tMonthIndex = parseInt(tMonth) - 1;
      return tMonthIndex === prevMonthIndex && tYear === prevYear.toString().padStart(2, '0');
    });
    
    if (prevTransactions.length === 0) {
      return { direction: 'neutral', percentage: 0, description: 'No previous month data' };
    }
    
    // Calculate previous month's spending
    const categoryBudgets: Record<string, number> = {};
    categories.forEach(cat => {
      if (cat.name !== "Hide from Budget") {
        categoryBudgets[cat.name] = cat.subcategories.reduce((sum, sub) => sum + (sub.amount || 0), 0);
      }
    });
    
    const prevCategoryTotals: Record<string, number> = {};
    Object.keys(categoryBudgets).forEach(cat => {
      prevCategoryTotals[cat] = 0;
    });
    prevCategoryTotals['Uncategorized'] = 0;
    
    prevTransactions.forEach(transaction => {
      const transactionCategory = transaction.Category?.trim();
      if (transactionCategory === "Hide from Budget") return;
      
      if (!transactionCategory) {
        prevCategoryTotals['Uncategorized'] += Math.abs(transaction.Amount);
        return;
      }
      
      const mainCategory = categories.find(cat => cat.name.trim() === transactionCategory);
      if (mainCategory) {
        prevCategoryTotals[mainCategory.name] += Math.abs(transaction.Amount);
      } else {
        const parentCategory = categories.find(cat =>
          cat.subcategories.some(sub => sub.name.trim() === transactionCategory)
        );
        if (parentCategory) {
          prevCategoryTotals[parentCategory.name] += Math.abs(transaction.Amount);
        } else {
          prevCategoryTotals['Uncategorized'] += Math.abs(transaction.Amount);
        }
      }
    });
    
    const prevTotal = Object.values(prevCategoryTotals).reduce((sum, val) => sum + val, 0);
    
    if (prevTotal === 0) return { direction: 'neutral', percentage: 0, description: 'No previous spending' };
    
    const change = ((currentTotal - prevTotal) / prevTotal) * 100;
    const direction = change > 0 ? 'up' : change < 0 ? 'down' : 'neutral';
    
    return {
      direction,
      percentage: Math.abs(change),
      description: 'Compared to previous month'
    };
  };

  // Main spending chart data
  const mainSpendingData = (() => {
    const categoryBudgets: Record<string, number> = {};
    categories.forEach(cat => {
      if (cat.name !== "Hide from Budget") {
        categoryBudgets[cat.name] = cat.subcategories.reduce((sum, sub) => sum + (sub.amount || 0), 0);
      }
    });

    const categoryTotals: Record<string, number> = {};
    Object.keys(categoryBudgets).forEach(cat => {
      categoryTotals[cat] = 0;
    });
    categoryTotals['Uncategorized'] = 0;

    filteredTransactions.forEach(transaction => {
      const transactionCategory = transaction.Category?.trim();
      if (transactionCategory === "Hide from Budget") return;

      if (!transactionCategory) {
        categoryTotals['Uncategorized'] += Math.abs(transaction.Amount);
        return;
      }

      const mainCategory = categories.find(cat => cat.name.trim() === transactionCategory);
      if (mainCategory) {
        categoryTotals[mainCategory.name] += Math.abs(transaction.Amount);
      } else {
        const parentCategory = categories.find(cat =>
          cat.subcategories.some(sub => sub.name.trim() === transactionCategory)
        );
        if (parentCategory) {
          categoryTotals[parentCategory.name] += Math.abs(transaction.Amount);
        } else {
          categoryTotals['Uncategorized'] += Math.abs(transaction.Amount);
        }
      }
    });

    const sortedCategories = Object.entries(categoryTotals)
      .filter(([cat]) => cat !== "Hide from Budget")
      .sort(([, a], [, b]) => b - a)
      .sort(([catA], [catB]) => catA === 'Uncategorized' ? 1 : catB === 'Uncategorized' ? -1 : 0);

    return sortedCategories.map(([category]) => {
      const actual = categoryTotals[category];
      const budget = categoryBudgets[category] || 0;
      const spent = actual;
      const budgeted = budget;
      
      if (spent <= budgeted) {
        // When spent is below budgeted: spent is base (nearest Y axis), remaining budgeted on top
        return {
          category,
          spent,
          budgeted,
          spentBase: spent,
          remainingBudgeted: budgeted - spent,
          budgetedBase: 0,
          overage: 0,
        };
      } else {
        // When spent is above budgeted: budgeted is base (light red), overage on top
        return {
          category,
          spent,
          budgeted,
          spentBase: 0,
          remainingBudgeted: 0,
          budgetedBase: budgeted,
          overage: spent - budgeted,
        };
      }
    });
  })();

  // Status chart data
  const statusData = (() => {
    const budgetCategoryNames = new Set<string>();
    categories.forEach(cat => {
      budgetCategoryNames.add(cat.name);
      cat.subcategories.forEach(sub => budgetCategoryNames.add(sub.name));
    });

    let confirmedCount = 0;
    let unconfirmedCount = 0;
    let uncategorizedCount = 0;

    filteredTransactions.forEach(transaction => {
      if (!transaction.Category || !budgetCategoryNames.has(transaction.Category)) {
        uncategorizedCount++;
      } else if (transaction.confirmed) {
        confirmedCount++;
      } else {
        unconfirmedCount++;
      }
    });

    return [
      { name: 'Confirmed', value: confirmedCount },
      { name: 'Unconfirmed', value: unconfirmedCount },
      { name: 'Uncategorized', value: uncategorizedCount },
    ];
  })();

  // Yearly budget chart data
  const yearlyData = (() => {
    const validSubcategories = new Set<string>();
    categories.forEach(category => {
      if (!category.isSystem) {
        category.subcategories.forEach(sub => {
          validSubcategories.add(sub.name.trim().toLowerCase());
        });
      }
    });

    const monthlySpending = Array(12).fill(0);
    transactions.forEach(transaction => {
      if (!transaction.Category || !transaction.Date) return;
      const transactionCategory = transaction.Category.trim().toLowerCase();
      if (!validSubcategories.has(transactionCategory)) return;

      const dateParts = transaction.Date.split('/');
      const month = parseInt(dateParts[0]) - 1;
      monthlySpending[month] += Math.abs(transaction.Amount);
    });

    let totalBudget = 0;
    categories.forEach(category => {
      if (!category.isSystem) {
        category.subcategories.forEach(sub => {
          totalBudget += sub.amount || 0;
        });
      }
    });

    const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return monthLabels.map((month, index) => {
      const spent = monthlySpending[index];
      const budgeted = totalBudget;
      
      if (spent <= budgeted) {
        // When spent is below budgeted: spent is base (nearest Y axis), remaining budgeted on top
        return {
          month,
          spent,
          budgeted,
          spentBase: spent,
          remainingBudgeted: budgeted - spent,
          budgetedBase: 0,
          overage: 0,
        };
      } else {
        // When spent is above budgeted: budgeted is base (light red), overage on top
        return {
          month,
          spent,
          budgeted,
          spentBase: 0,
          remainingBudgeted: 0,
          budgetedBase: budgeted,
          overage: spent - budgeted,
        };
      }
    });
  })();

  return (
    <Layout>
      <div className="flex flex-col lg:h-[calc(100vh-1.5rem-4rem-1.5rem)]">
        <div className="sticky top-0 lg:top-0 z-10 h-auto lg:h-16 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 lg:gap-0 bg-background border-b -mx-4 lg:-mx-6 px-4 lg:px-6 py-4 lg:py-0 flex-shrink-0">
          <h1 className="font-medium">Dashboard</h1>
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
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
                <CardTitle>Budget vs Actual</CardTitle>
                <CardDescription>Showing monthly data for the current year</CardDescription>
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
                      axisLine={false}
                    />
                    <YAxis hide />
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
                                <span className="text-sm font-mono">${budgeted.toFixed(2)}</span>
                              </div>
                              <div className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-2">
                                  <div className="w-3 h-3 rounded" style={{ backgroundColor: spent > budgeted ? 'hsl(0, 84%, 60%)' : 'hsl(220, 13%, 18%)' }} />
                                  <span className="text-sm font-medium">Spent</span>
                                </div>
                                <span className="text-sm font-mono">${spent.toFixed(2)}</span>
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
                      radius={[0, 0, 12, 12]}
                      legendType="none"
                    />
                    <Bar 
                      dataKey="remainingBudgeted" 
                      stackId="budget" 
                      fill="#f5f5f5"
                      stroke="#d1d1d1"
                      strokeWidth={1}
                      radius={[12, 12, 0, 0]}
                      legendType="none"
                    />
                    <Bar 
                      dataKey="budgetedBase" 
                      stackId="budget" 
                      fill="hsl(0, 70%, 85%)"
                      stroke="#d1d1d1"
                      strokeWidth={1}
                      radius={[0, 0, 12, 12]}
                      legendType="none"
                    />
                    <Bar 
                      dataKey="overage" 
                      stackId="budget" 
                      fill="hsl(0, 84%, 60%)"
                      radius={[12, 12, 0, 0]}
                      legendType="none"
                    />
                  </BarChart>
                </ChartContainer>
              </CardContent>
              <CardFooter className="flex-shrink-0 border-t pt-4">
                {(() => {
                  const trend = getYearlyTrend();
                  const TrendIcon = trend.direction === 'up' ? TrendingUp : trend.direction === 'down' ? TrendingDown : Minus;
                  const trendColor = trend.direction === 'up' ? 'text-green-600' : trend.direction === 'down' ? 'text-red-600' : 'text-muted-foreground';
                  
                  return (
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-2">
                        <TrendIcon className={`h-4 w-4 ${trendColor}`} />
                        <span className="font-semibold">
                          {trend.direction === 'up' ? 'Trending up' : trend.direction === 'down' ? 'Trending down' : 'No change'} 
                          {trend.percentage > 0 && ` by ${trend.percentage.toFixed(1)}%`}
                        </span>
                      </div>
                      <span className="text-sm text-muted-foreground">{trend.description}</span>
                    </div>
                  );
                })()}
              </CardFooter>
            </Card>

            <Card className="flex flex-col md:col-span-1 shadow-none overflow-hidden">
              <CardHeader className="flex-shrink-0">
                <CardTitle>Categorization Progress</CardTitle>
                <CardDescription>{getDateRange(filteredTransactions)}</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 lg:min-h-0 overflow-hidden">
                <div className="relative h-[250px] lg:h-full w-full">
                  <ChartContainer config={chartConfig} className="h-full w-full">
                    <PieChart>
                      <Pie
                        data={statusData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={70}
                        outerRadius={100}
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
                {(() => {
                  const trend = getCategorizationTrend();
                  const TrendIcon = trend.direction === 'up' ? TrendingUp : trend.direction === 'down' ? TrendingDown : Minus;
                  const trendColor = trend.direction === 'up' ? 'text-green-600' : trend.direction === 'down' ? 'text-red-600' : 'text-muted-foreground';
                  
                  return (
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-2">
                        <TrendIcon className={`h-4 w-4 ${trendColor}`} />
                        <span className="font-semibold">
                          {trend.direction === 'up' ? 'Trending up' : trend.direction === 'down' ? 'Trending down' : 'No change'} 
                          {trend.percentage > 0 && ` by ${trend.percentage.toFixed(1)}%`}
                        </span>
                      </div>
                      <span className="text-sm text-muted-foreground">{trend.description}</span>
                    </div>
                  );
                })()}
              </CardFooter>
            </Card>
            </div>
          </div>

          <Card className="flex flex-col lg:flex-1 lg:min-h-0 shadow-none overflow-hidden">
            <CardHeader className="flex-shrink-0">
              <CardTitle>Monthly Spending by Main Category</CardTitle>
              <CardDescription>{getDateRange(filteredTransactions)}</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 lg:min-h-0 overflow-hidden">
              <ChartContainer config={chartConfig} className="h-[300px] lg:h-full w-full">
                <BarChart
                  data={mainSpendingData}
                  layout="vertical"
                  barSize={40}
                >
                  <XAxis type="number" hide />
                  <YAxis 
                    dataKey="category" 
                    type="category" 
                    width={120}
                    tickLine={false}
                    axisLine={false}
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
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded" style={{ backgroundColor: '#f5f5f5', border: '1px solid #d1d1d1' }} />
                                <span className="text-sm font-medium">Budgeted</span>
                              </div>
                              <span className="text-sm font-mono">${budgeted.toFixed(2)}</span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded" style={{ backgroundColor: spent > budgeted ? 'hsl(0, 84%, 60%)' : 'hsl(220, 13%, 18%)' }} />
                                <span className="text-sm font-medium">Spent</span>
                              </div>
                              <span className="text-sm font-mono">${spent.toFixed(2)}</span>
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
                    radius={[0, 12, 12, 0]}
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
                    radius={[0, 12, 12, 0]}
                    legendType="none"
                  />
                </BarChart>
              </ChartContainer>
            </CardContent>
            <CardFooter className="flex-shrink-0 border-t pt-4">
              {(() => {
                const trend = getMonthlySpendingTrend();
                const TrendIcon = trend.direction === 'up' ? TrendingUp : trend.direction === 'down' ? TrendingDown : Minus;
                const trendColor = trend.direction === 'up' ? 'text-green-600' : trend.direction === 'down' ? 'text-red-600' : 'text-muted-foreground';
                
                return (
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2">
                      <TrendIcon className={`h-4 w-4 ${trendColor}`} />
                      <span className="font-semibold">
                        {trend.direction === 'up' ? 'Trending up' : trend.direction === 'down' ? 'Trending down' : 'No change'} 
                        {trend.percentage > 0 && ` by ${trend.percentage.toFixed(1)}%`}
                      </span>
                    </div>
                    <span className="text-sm text-muted-foreground">{trend.description}</span>
                  </div>
                );
              })()}
            </CardFooter>
          </Card>
        </div>
      </div>
    </Layout>
  );
}

