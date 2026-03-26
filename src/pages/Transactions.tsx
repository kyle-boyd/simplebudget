import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ColumnDef } from '@tanstack/react-table';
import { ArrowUpDown, Check, ListFilter, Trash2, AlertTriangle } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel, SelectSeparator } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ResponsiveDialog, ResponsiveDialogContent } from '@/components/ui/responsive-dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { DataTable } from '@/components/ui/data-table';
import { useAuth } from '@/hooks/useAuth';
import { useTransactions, Transaction } from '@/hooks/useTransactions';
import { useCategories } from '@/hooks/useCategories';
import { useRules, Rule } from '@/hooks/useRules';
import { formatCurrency, createTransactionId, parseDate, detectCategoryColumn, scoreCategoryMatch, detectDateColumn, detectAmountColumn, detectDescriptionColumn } from '@/lib/utils';
import Papa from 'papaparse';

const SELECTED_MONTH_KEY = 'selectedMonth';

export function Transactions() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const { transactions, addTransactions, updateTransaction, saveTransactions, toggleConfirm } = useTransactions(user?.uid || null);
  const { categories } = useCategories(user?.uid || null);
  const { rules, addRule, updateRule, deleteRule, findConflict } = useRules(user?.uid || null);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    // Initialize from localStorage if available
    return localStorage.getItem(SELECTED_MONTH_KEY) || 'All Months';
  });

  // Get category filter from URL params
  const categoryFilterFromUrl = searchParams.get('category') || undefined;
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [isEditPanelOpen, setIsEditPanelOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [createRule, setCreateRule] = useState(false);
  const [showRulesPanel, setShowRulesPanel] = useState(false);
  const [showRuleDialog, setShowRuleDialog] = useState(false);
  const [pendingRule, setPendingRule] = useState<{ matchText: string; category: string } | null>(null);
  const [conflictingRule, setConflictingRule] = useState<Rule | null>(null);
  const [ruleScope, setRuleScope] = useState<'future' | 'all'>('future');
  const [isOverridingRule, setIsOverridingRule] = useState(false);
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvMappings, setCsvMappings] = useState<Record<string, string>>({});
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvPreviewData, setCsvPreviewData] = useState<any[]>([]);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024); // Tailwind lg breakpoint
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Save to localStorage whenever selectedMonth changes
  useEffect(() => {
    localStorage.setItem(SELECTED_MONTH_KEY, selectedMonth);
  }, [selectedMonth]);

  const months = ['All Months', ...new Set(
    transactions.map(t => {
      const [month, , year] = t.Date.split('/');
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
        'July', 'August', 'September', 'October', 'November', 'December'];
      return `${monthNames[parseInt(month) - 1]}, 20${year}`;
    })
  )];

  const [confirmFilter, setConfirmFilter] = useState<'all' | 'unconfirmed' | 'confirmed'>('all');

  const filteredTransactions = useMemo(() => {
    let result = selectedMonth === 'All Months'
      ? transactions
      : transactions.filter(t => {
          const [monthName, year] = selectedMonth.split(', ');
          const monthIndex = ['January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December']
            .indexOf(monthName) + 1;
          const [tMonth, , tYear] = t.Date.split('/');
          return parseInt(tMonth) === monthIndex && tYear === year.slice(-2);
        });

    if (confirmFilter === 'confirmed') result = result.filter(t => t.confirmed);
    if (confirmFilter === 'unconfirmed') result = result.filter(t => !t.confirmed);

    return result;
  }, [transactions, selectedMonth, confirmFilter]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      complete: (results) => {
        if (results.data && results.data.length > 0) {
          const headers = Object.keys(results.data[0] as object);
          const previewData = results.data.slice(0, 2); // Get first 2 rows for preview
          
          // Get all existing subcategory names for smart matching
          const allSubcategoryNames = categories.flatMap(cat => 
            cat.subcategories.map(sub => sub.name)
          );
          
          // Smart column detection for all fields
          let detectedDateColumn = '';
          let detectedAmountColumn = '';
          let detectedDescriptionColumn = '';
          let detectedCategoryColumn = '';
          
          let bestDateScore = 0;
          let bestAmountScore = 0;
          let bestDescriptionScore = 0;
          let bestCategoryScore = 0;
          
          // Detect by column name for Date, Amount, Description
          for (const header of headers) {
            const dateScore = detectDateColumn(header);
            const amountScore = detectAmountColumn(header);
            const descScore = detectDescriptionColumn(header);
            
            if (dateScore > bestDateScore) {
              bestDateScore = dateScore;
              detectedDateColumn = header;
            }
            if (amountScore > bestAmountScore) {
              bestAmountScore = amountScore;
              detectedAmountColumn = header;
            }
            if (descScore > bestDescriptionScore) {
              bestDescriptionScore = descScore;
              detectedDescriptionColumn = header;
            }
          }
          
          // Smart category column detection - check by name first
          let bestNameScore = 0;
          for (const header of headers) {
            const nameScore = detectCategoryColumn(header);
            if (nameScore > bestNameScore) {
              bestNameScore = nameScore;
              detectedCategoryColumn = header;
            }
          }
          
          // If we have existing categories, also try matching by values
          if (allSubcategoryNames.length > 0) {
            for (const header of headers) {
              // Skip if we already detected this by name and it's high confidence
              if (header === detectedCategoryColumn && bestNameScore >= 50) {
                continue;
              }
              
              // Get sample values from this column
              const columnValues = results.data
                .slice(0, Math.min(20, results.data.length)) // Sample first 20 rows
                .map(row => row[header])
                .filter(val => val !== null && val !== undefined && val !== '');
              
              if (columnValues.length > 0) {
                const matchScore = scoreCategoryMatch(columnValues, allSubcategoryNames);
                // Combine name score and value match score
                const nameScore = detectCategoryColumn(header);
                const combinedScore = nameScore * 0.4 + matchScore * 0.6;
                
                if (combinedScore > bestCategoryScore) {
                  bestCategoryScore = combinedScore;
                  detectedCategoryColumn = header;
                }
              }
            }
          }
          
          setCsvFile(file);
          setCsvHeaders(headers);
          setCsvPreviewData(previewData);
          setCsvMappings({
            Date: detectedDateColumn || headers[0] || '',
            Amount: detectedAmountColumn || headers[1] || '',
            Description: detectedDescriptionColumn || headers[2] || '',
            Category: detectedCategoryColumn || headers[3] || '',
          });
          setShowMappingModal(true);
        }
      }
    });
  };

  const handleSaveMapping = () => {
    if (!csvFile) return;

    Papa.parse(csvFile, {
      header: true,
      complete: (results) => {
        const newTransactions: Transaction[] = (results.data as any[])
          .filter(t => {
            const dateField = csvMappings.Date;
            const amountField = csvMappings.Amount;
            return dateField && amountField && dateField !== 'none' && amountField !== 'none' && t[dateField] && t[amountField];
          })
          .map(t => {
            const dateField = csvMappings.Date;
            const descriptionField = csvMappings.Description;
            const amountField = csvMappings.Amount;
            const categoryField = csvMappings.Category;
            
            const amount = parseFloat(String(t[amountField]).replace(/[^0-9.-]/g, ''));
            const parsedDate = parseDate(t[dateField]);
            return {
              id: createTransactionId({
                Date: parsedDate,
                Description: descriptionField && descriptionField !== 'none' ? t[descriptionField] || '' : '',
                Amount: amount
              }),
              Date: parsedDate,
              Amount: amount,
              Description: descriptionField && descriptionField !== 'none' ? t[descriptionField] || '' : '',
              Category: categoryField && categoryField !== 'none' ? t[categoryField] || '' : '',
              confirmed: false,
            };
          });

        addTransactions(newTransactions);
        setShowMappingModal(false);
        setCsvFile(null);
      }
    });
  };

  const handleSaveChanges = () => {
    if (!selectedTransaction) return;

    updateTransaction(selectedTransaction.id, {
      Category: selectedCategory || selectedTransaction.Category,
      hasRule: createRule,
    });

    setIsEditPanelOpen(false);

    if (createRule && selectedCategory) {
      const matchText = selectedTransaction.Description;
      const conflict = findConflict(matchText);
      setPendingRule({ matchText, category: selectedCategory });
      setConflictingRule(conflict);
      setRuleScope('future');
      setShowRuleDialog(true);
    } else {
      setSelectedTransaction(null);
      setCreateRule(false);
    }
  };

  const handleConfirmRule = async () => {
    if (!pendingRule) return;

    if (conflictingRule) {
      await updateRule(conflictingRule.id, { category: pendingRule.category });
    } else {
      await addRule({
        matchText: pendingRule.matchText,
        category: pendingRule.category,
        createdAt: new Date().toISOString(),
      });
    }

    if (ruleScope === 'all') {
      const matchLower = pendingRule.matchText.toLowerCase();
      const updated = transactions.map(t =>
        t.Description.toLowerCase() === matchLower
          ? { ...t, Category: pendingRule.category, hasRule: true }
          : t
      );
      await saveTransactions(updated);
    }

    setShowRuleDialog(false);
    setPendingRule(null);
    setConflictingRule(null);
    setSelectedTransaction(null);
    setCreateRule(false);
    setIsOverridingRule(false);
  };

  const allSubcategories = categories.flatMap(cat =>
    cat.subcategories.map(sub => ({ name: sub.name, parent: cat.name }))
  );

  // Memoize category options for the select dropdowns
  const categoryOptions = useMemo(() => {
    return categories.flatMap(category =>
      category.subcategories.map(sub => ({
        id: sub.id,
        value: sub.name,
        label: `${category.name} - ${sub.name}`
      }))
    );
  }, [categories]);

  // Memoize category groups for grouped dropdowns
  const categoryGroups = useMemo(() => {
    return categories.map(category => ({
      id: category.id,
      name: category.name,
      subcategories: category.subcategories.map(sub => ({
        id: sub.id,
        value: sub.name,
        label: sub.name
      }))
    }));
  }, [categories]);

  // Memoized handler for category updates
  const handleCategoryChange = useCallback((transactionId: string, category: string) => {
    updateTransaction(transactionId, { Category: category });
  }, [updateTransaction]);

  // Column definitions for the data table
  const columns: ColumnDef<Transaction>[] = useMemo(() => [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
          onClick={(e) => e.stopPropagation()}
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "Date",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="h-8 px-2 lg:px-3"
          >
            Date
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        )
      },
      cell: ({ row }) => {
        const transaction = row.original;
        const dateParts = transaction.Date.split('/');
        const date = new Date(2000 + parseInt(dateParts[2]), parseInt(dateParts[0]) - 1, parseInt(dateParts[1]));
        const formattedDate = date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        });
        return <div className="font-medium">{formattedDate}</div>
      },
    },
    {
      accessorKey: "Description",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="h-8 px-2 lg:px-3"
          >
            Description
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        )
      },
      cell: ({ row }) => {
        return (
          <div className="min-w-0 lg:min-w-[200px] truncate" title={String(row.getValue("Description") || '')}>
            {row.getValue("Description")}
          </div>
        )
      },
    },
    {
      accessorKey: "Amount",
      header: ({ column }) => {
        return (
          <div className="text-right">
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
              className="h-8 px-2 lg:px-3"
            >
              Amount
              <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          </div>
        )
      },
      cell: ({ row }) => {
        const transaction = row.original;
        const amount = parseFloat(String(row.getValue("Amount")));
        const dateParts = transaction.Date.split('/');
        const date = new Date(2000 + parseInt(dateParts[2]), parseInt(dateParts[0]) - 1, parseInt(dateParts[1]));
        const formattedDate = date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        });
        if (isMobile) {
          return (
            <div className="text-right">
              <div className="font-medium">{formatCurrency(amount)}</div>
              <div className="text-xs text-muted-foreground">{formattedDate}</div>
            </div>
          );
        }
        return <div className="text-right font-medium">{formatCurrency(amount)}</div>
      },
    },
    {
      accessorKey: "Category",
      header: "Category",
      filterFn: (row, id, value) => {
        const category = row.getValue(id) as string;
        return value === undefined || value === "" || value === "all" || category === value;
      },
      cell: ({ row }) => {
        const transaction = row.original;
        const isValidCategory = categories.some(cat =>
          cat.subcategories.some(sub => sub.name === transaction.Category)
        );

        return (
          <div
            className={`w-full ${!isValidCategory && transaction.Category ? 'text-destructive' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            {transaction.confirmed ? (
              transaction.Category || 'No Category'
            ) : (
              <Select
                value={transaction.Category || ''}
                onValueChange={(value) => {
                  handleCategoryChange(transaction.id, value);
                }}
              >
                <SelectTrigger className="h-8 w-[200px]">
                  <SelectValue placeholder="Select Category" />
                </SelectTrigger>
                <SelectContent className="w-[200px]">
                  {categories.map((category, index) => (
                    <React.Fragment key={category.id}>
                      <SelectGroup>
                        <SelectLabel>{category.name}</SelectLabel>
                        {category.subcategories.map(sub => (
                          <SelectItem key={sub.id} value={sub.name}>
                            {sub.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                      {index < categories.length - 1 && <SelectSeparator />}
                    </React.Fragment>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )
      },
    },
    {
      accessorKey: "confirmed",
      header: () => {
        return (
          <div className="text-center">
            Status
          </div>
        )
      },
      cell: ({ row }) => {
        const transaction = row.original;
        return (
          <div className="group flex items-center justify-center">
            {transaction.confirmed ? (
              <div className="grid grid-cols-3 items-center gap-2 w-full max-w-[300px]">
                <div className="flex justify-start">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleConfirm(transaction.id);
                    }}
                  >
                    Unconfirm
                  </Button>
                </div>
                <div className="flex justify-center">
                  <Badge variant="outline" className="flex items-center gap-1.5">
                    <div className="h-3.5 w-3.5 rounded-full bg-green-600 dark:bg-green-400 flex items-center justify-center">
                      <Check className="h-2 w-2 text-white stroke-[3]" />
                    </div>
                    Confirmed
                  </Badge>
                </div>
                <div className="flex justify-end">
                  {/* Empty spacer to balance layout */}
                </div>
              </div>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleConfirm(transaction.id);
                }}
              >
                Confirm
              </Button>
            )}
          </div>
        )
      },
    },
  ], [categories, categoryOptions, handleCategoryChange, toggleConfirm, isMobile]);

  const isMobileSheetOpen = isMobile && isEditPanelOpen && !!selectedTransaction;

  return (
    <Layout>
      <div className="space-y-6">
        <div className="sticky top-0 lg:top-0 z-10 h-auto lg:h-16 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 lg:gap-0 bg-background border-b -mx-4 lg:-mx-6 px-4 lg:px-6 py-4 lg:py-0">
          <h1 className="font-medium">Transactions</h1>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full lg:w-auto">
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Select month" />
              </SelectTrigger>
              <SelectContent>
                {months.map(month => (
                  <SelectItem key={month} value={month}>{month}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={confirmFilter} onValueChange={(v) => setConfirmFilter(v as 'all' | 'unconfirmed' | 'confirmed')}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Transactions</SelectItem>
                <SelectItem value="unconfirmed">Unconfirmed</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="hidden"
              id="csv-upload"
            />
            <Button
              variant="outline"
              onClick={() => setShowRulesPanel(true)}
              className="w-full sm:w-auto flex items-center gap-2"
            >
              <ListFilter className="h-4 w-4" />
              Rules
              {rules.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                  {rules.length}
                </Badge>
              )}
            </Button>
            <Button asChild className="w-full sm:w-auto">
              <label htmlFor="csv-upload" className="cursor-pointer">
                Upload Transactions
              </label>
            </Button>
          </div>
        </div>

      <div className="lg:flex lg:items-start lg:gap-3">
        <div
          className={`flex-1 min-w-0 transition-[padding,max-width] duration-300 ${
            isEditPanelOpen && selectedTransaction ? 'lg:pr-6' : ''
          }`}
        >
          <DataTable
            columns={columns}
            data={filteredTransactions}
            searchPlaceholder="Search transactions..."
            categoryFilterKey="Category"
            categoryFilterGroups={categoryGroups}
            categoryFilterPlaceholder="Filter by category"
            initialCategoryFilter={categoryFilterFromUrl}
            forceHiddenColumnIds={isMobile ? ['select', 'Category', 'confirmed', 'Date'] : undefined}
            compact={isMobile}
            columnOrder={isMobile ? ['Description', 'Amount', 'select', 'Category', 'confirmed', 'Date'] : undefined}
            onSwipeRight={isMobile ? (transaction) => toggleConfirm(transaction.id) : undefined}
            getSwipeAction={isMobile ? (transaction) => transaction.confirmed ? 'unconfirm' : 'confirm' : undefined}
            onRowClick={(transaction) => {
              setSelectedTransaction(transaction);
              setSelectedCategory(transaction.Category || '');
              setCreateRule(transaction.hasRule || false);
              setIsOverridingRule(false);
              setIsEditPanelOpen(true);
            }}
            getRowClassName={(transaction) => {
              const classes = [];
              if (transaction.confirmed) {
                classes.push('opacity-60');
              }
              if (selectedTransaction && selectedTransaction.id === transaction.id && isEditPanelOpen) {
                classes.push('bg-accent border-l-4 border-l-primary');
              }
              return classes.join(' ');
            }}
          />
        </div>

        {/* Desktop Edit Panel */}
        {isEditPanelOpen && selectedTransaction && (
          <Card className="hidden lg:block w-80 shrink-0 lg:sticky lg:top-[9rem] lg:self-start">
            <CardHeader>
              <CardTitle>{selectedTransaction.Description}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="text-sm text-muted-foreground">
                  {new Date(2000 + parseInt(selectedTransaction.Date.split('/')[2]), 
                    parseInt(selectedTransaction.Date.split('/')[0]) - 1, 
                    parseInt(selectedTransaction.Date.split('/')[1])).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                </div>
                <div className="text-2xl font-bold">
                  {formatCurrency(parseFloat(String(selectedTransaction.Amount)))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Category</label>
                <Select
                  value={selectedCategory}
                  onValueChange={(value) => {
                    setSelectedCategory(value);
                    if (selectedTransaction?.hasRule && createRule && value !== selectedTransaction.Category) {
                      setCreateRule(false);
                      setIsOverridingRule(true);
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category, index) => (
                      <React.Fragment key={category.id}>
                        <SelectGroup>
                          <SelectLabel>{category.name}</SelectLabel>
                          {category.subcategories.map(sub => (
                            <SelectItem key={sub.id} value={sub.name}>
                              {sub.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                        {index < categories.length - 1 && <SelectSeparator />}
                      </React.Fragment>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {isOverridingRule && (
                <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-800 dark:text-amber-300">
                    This overrides the existing rule. Only this transaction will be recategorized.
                  </p>
                </div>
              )}

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="create-rule"
                  checked={createRule}
                  onCheckedChange={(checked) => {
                    setCreateRule(checked as boolean);
                    if (checked) setIsOverridingRule(false);
                  }}
                />
                <label htmlFor="create-rule" className="text-sm">
                  Always categorize as: <strong>{selectedCategory || 'Select Category'}</strong>
                </label>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsEditPanelOpen(false);
                    setIsOverridingRule(false);
                  }}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button onClick={handleSaveChanges} className="flex-1">
                  Save
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

        {/* Mobile Edit Panel */}
      <Sheet
        open={isMobileSheetOpen}
        onOpenChange={(open) => {
          if (isMobile) setIsEditPanelOpen(open);
        }}
      >
        <SheetContent 
          side="bottom" 
          className="lg:hidden max-h-[85vh] overflow-y-auto rounded-t-lg" 
          hideOverlay
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
            {selectedTransaction && (
              <>
                <div className="flex justify-center pt-1 pb-2" aria-hidden>
                  <div className="w-9 h-1 rounded-full bg-muted-foreground/30" />
                </div>
                <SheetHeader>
                  <SheetTitle>{selectedTransaction.Description}</SheetTitle>
                </SheetHeader>
                <div className="space-y-4 mt-4 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                  <div>
                    <div className="text-sm text-muted-foreground">
                      {new Date(2000 + parseInt(selectedTransaction.Date.split('/')[2]), 
                        parseInt(selectedTransaction.Date.split('/')[0]) - 1, 
                        parseInt(selectedTransaction.Date.split('/')[1])).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                    </div>
                    <div className="text-2xl font-bold">
                      {formatCurrency(parseFloat(String(selectedTransaction.Amount)))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Category</label>
                    <Select
                      value={selectedCategory}
                      onValueChange={(value) => {
                        setSelectedCategory(value);
                        if (selectedTransaction?.hasRule && createRule && value !== selectedTransaction.Category) {
                          setCreateRule(false);
                          setIsOverridingRule(true);
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((category, index) => (
                          <React.Fragment key={category.id}>
                            <SelectGroup>
                              <SelectLabel>{category.name}</SelectLabel>
                              {category.subcategories.map(sub => (
                                <SelectItem key={sub.id} value={sub.name}>
                                  {sub.name}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                            {index < categories.length - 1 && <SelectSeparator />}
                          </React.Fragment>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {isOverridingRule && (
                    <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3">
                      <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                      <p className="text-xs text-amber-800 dark:text-amber-300">
                        This overrides the existing rule. Only this transaction will be recategorized.
                      </p>
                    </div>
                  )}

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="create-rule-mobile"
                      checked={createRule}
                      onCheckedChange={(checked) => {
                        setCreateRule(checked as boolean);
                        if (checked) setIsOverridingRule(false);
                      }}
                    />
                    <label htmlFor="create-rule-mobile" className="text-sm">
                      Always categorize as: <strong>{selectedCategory || 'Select Category'}</strong>
                    </label>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setIsEditPanelOpen(false);
                        setIsOverridingRule(false);
                      }}
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                    <Button onClick={handleSaveChanges} className="flex-1">
                      Save
                    </Button>
                  </div>
                </div>
              </>
            )}
          </SheetContent>
        </Sheet>

        {/* Rules Side Panel */}
        <Sheet open={showRulesPanel} onOpenChange={setShowRulesPanel}>
          <SheetContent side="right" className="w-80 sm:w-96 flex flex-col">
            <SheetHeader>
              <SheetTitle>Category Rules</SheetTitle>
            </SheetHeader>
            <p className="text-sm text-muted-foreground mt-1">
              Rules automatically categorize future transactions based on their description.
            </p>
            <div className="mt-4 flex-1 overflow-y-auto space-y-2">
              {rules.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center gap-2">
                  <ListFilter className="h-8 w-8 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">No rules yet.</p>
                  <p className="text-xs text-muted-foreground">
                    Select a transaction and check "Always categorize as" to create one.
                  </p>
                </div>
              ) : (
                rules.map(rule => (
                  <div key={rule.id} className="flex items-start justify-between p-3 border rounded-md gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate" title={rule.matchText}>
                        {rule.matchText}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        → {rule.category}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0 h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteRule(rule.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </SheetContent>
        </Sheet>

        {/* Rule Conflict / Scope Dialog */}
        <ResponsiveDialog open={showRuleDialog} onOpenChange={(open) => {
          if (!open) {
            setShowRuleDialog(false);
            setPendingRule(null);
            setConflictingRule(null);
            setSelectedTransaction(null);
            setCreateRule(false);
          }
        }}>
          <ResponsiveDialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {conflictingRule ? 'Rule Conflict' : 'Create Rule'}
              </DialogTitle>
              {conflictingRule && (
                <DialogDescription className="flex items-start gap-2 mt-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span className="text-sm">
                    A rule already categorizes <strong>"{pendingRule?.matchText}"</strong> as{' '}
                    <strong>{conflictingRule.category}</strong>. This will override it with{' '}
                    <strong>{pendingRule?.category}</strong>.
                  </span>
                </DialogDescription>
              )}
            </DialogHeader>
            <div className="space-y-4 py-2">
              {!conflictingRule && (
                <p className="text-sm text-muted-foreground">
                  Always categorize <strong className="text-foreground">"{pendingRule?.matchText}"</strong> as{' '}
                  <strong className="text-foreground">{pendingRule?.category}</strong>.
                </p>
              )}
              <div className="space-y-2">
                <p className="text-sm font-medium">Apply to:</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRuleScope('future')}
                    className={`flex flex-col items-start p-3 rounded-md border text-left transition-colors ${
                      ruleScope === 'future'
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border hover:border-muted-foreground'
                    }`}
                  >
                    <span className="text-sm font-medium">Future only</span>
                    <span className="text-xs text-muted-foreground mt-0.5">
                      New transactions from now on
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRuleScope('all')}
                    className={`flex flex-col items-start p-3 rounded-md border text-left transition-colors ${
                      ruleScope === 'all'
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border hover:border-muted-foreground'
                    }`}
                  >
                    <span className="text-sm font-medium">All matching</span>
                    <span className="text-xs text-muted-foreground mt-0.5">
                      Future + existing transactions
                    </span>
                  </button>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowRuleDialog(false);
                  setPendingRule(null);
                  setConflictingRule(null);
                  setSelectedTransaction(null);
                  setCreateRule(false);
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleConfirmRule}>
                {conflictingRule ? 'Override Rule' : 'Create Rule'}
              </Button>
            </DialogFooter>
          </ResponsiveDialogContent>
        </ResponsiveDialog>

        <ResponsiveDialog open={showMappingModal} onOpenChange={setShowMappingModal}>
          <ResponsiveDialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Match CSV Columns</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {/* Horizontal table-like mapping with dropdowns */}
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b">
                      {['Date', 'Amount', 'Description', 'Category'].map(field => (
                        <th key={field} className="text-left p-3 font-medium">
                          {field}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      {['Date', 'Amount', 'Description', 'Category'].map(field => (
                        <td key={field} className="p-3">
                          <Select
                            value={csvMappings[field] || 'none'}
                            onValueChange={(value) => setCsvMappings({ ...csvMappings, [field]: value })}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder={`Select ${field} column`} />
                            </SelectTrigger>
                            <SelectContent>
                              {csvHeaders.map(header => (
                                <SelectItem key={header} value={header}>
                                  {header}
                                </SelectItem>
                              ))}
                              <SelectItem value="none">No field</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Example transactions preview */}
              {csvPreviewData.length > 0 && (
                <div className="mt-6 space-y-2">
                  <h3 className="text-sm font-medium">Example Transactions Preview</h3>
                  <div className="overflow-x-auto border rounded-md">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left p-2 font-medium">Date</th>
                          <th className="text-left p-2 font-medium">Description</th>
                          <th className="text-right p-2 font-medium">Amount</th>
                          <th className="text-left p-2 font-medium">Category</th>
                        </tr>
                      </thead>
                      <tbody>
                        {csvPreviewData.map((row, idx) => {
                          // Get mapped values
                          const dateField = csvMappings.Date && csvMappings.Date !== 'none' ? csvMappings.Date : null;
                          const descriptionField = csvMappings.Description && csvMappings.Description !== 'none' ? csvMappings.Description : null;
                          const amountField = csvMappings.Amount && csvMappings.Amount !== 'none' ? csvMappings.Amount : null;
                          const categoryField = csvMappings.Category && csvMappings.Category !== 'none' ? csvMappings.Category : null;

                          // Format date using smart parser
                          let formattedDate = '';
                          if (dateField && row[dateField]) {
                            try {
                              const parsedDateStr = parseDate(row[dateField]);
                              // Convert parsed date (MM/DD/YY) to Date object for formatting
                              const dateParts = parsedDateStr.split('/');
                              if (dateParts.length === 3) {
                                const year = parseInt(dateParts[2]);
                                // Handle 2-digit year: assume 20xx for 00-99
                                const fullYear = year < 100 ? 2000 + year : year;
                                const date = new Date(fullYear, parseInt(dateParts[0]) - 1, parseInt(dateParts[1]));
                                if (!isNaN(date.getTime())) {
                                  formattedDate = date.toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric'
                                  });
                                } else {
                                  formattedDate = parsedDateStr;
                                }
                              } else {
                                formattedDate = parsedDateStr;
                              }
                            } catch (e) {
                              formattedDate = String(row[dateField]);
                            }
                          }

                          // Format amount
                          let formattedAmount = '';
                          if (amountField && row[amountField]) {
                            try {
                              const amount = parseFloat(String(row[amountField]).replace(/[^0-9.-]/g, ''));
                              formattedAmount = formatCurrency(amount);
                            } catch (e) {
                              formattedAmount = String(row[amountField]);
                            }
                          }

                          const description = descriptionField && row[descriptionField] ? String(row[descriptionField]) : '';
                          const category = categoryField && row[categoryField] ? String(row[categoryField]) : '';

                          return (
                            <tr key={idx} className="border-b">
                              <td className="p-2 font-medium">{formattedDate || '-'}</td>
                              <td className="p-2 min-w-[200px]">{description || '-'}</td>
                              <td className="p-2 text-right font-medium">{formattedAmount || '-'}</td>
                              <td className="p-2">{category || '-'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowMappingModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveMapping}>Import Transactions</Button>
            </DialogFooter>
          </ResponsiveDialogContent>
        </ResponsiveDialog>
      </div>
    </Layout>
  );
}

