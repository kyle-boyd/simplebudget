import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ColumnDef, Column } from '@tanstack/react-table';
import { ArrowUpDown, ArrowUp, ArrowDown, Check, ListFilter, Trash2, AlertTriangle, Building2, X, Plus, Upload, SlidersHorizontal, Tag } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel, SelectSeparator } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';
import { DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ResponsiveDialog, ResponsiveDialogContent } from '@/components/ui/responsive-dialog';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { DataTable } from '@/components/ui/data-table';
import { useAuth } from '@/hooks/useAuth';
import { useTransactions, Transaction } from '@/hooks/useTransactions';
import { useCategories } from '@/hooks/useCategories';
import { useRules, Rule } from '@/hooks/useRules';
import { useBankAccounts, BankAccount } from '@/hooks/useBankAccounts';
import { useCategoryMappings } from '@/hooks/useCategoryMappings';
import { useCurrency } from '@/hooks/useUserSettings';
import { useIsMobile } from '@/hooks/useIsMobile';
import { categorize, ruleMatches } from '@/lib/categorization';
import {
  ALL_MONTHS,
  filterByMonth,
  formatTransactionDate,
  monthOptions,
  parseTransactionDate,
} from '@/lib/months';
import { createTransactionId, parseDate, detectCategoryColumn, scoreCategoryMatch, detectDateColumn, detectAmountColumn, detectDescriptionColumn } from '@/lib/utils';
import Papa from 'papaparse';

const SELECTED_MONTH_KEY = 'selectedMonth';
const CSV_FIELDS = ['Date', 'Amount', 'Description', 'Category'] as const;

type CsvRow = Record<string, string | undefined>;

/** Column header button whose icon reflects the current sort direction. */
function SortableHeader({
  column,
  children,
}: {
  column: Column<Transaction, unknown>;
  children: React.ReactNode;
}) {
  const sorted = column.getIsSorted();
  const Icon = sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ArrowUpDown;
  return (
    <Button
      variant="ghost"
      onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      className="h-8 px-2 lg:px-3"
    >
      {children}
      <Icon className="ml-2 h-4 w-4" />
    </Button>
  );
}

export function Transactions() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const { transactions, loading: transactionsLoading, addTransactions, updateTransaction, mutateTransactions, toggleConfirm, deleteTransactionsByAccount } = useTransactions(user?.uid || null);
  const { categories, loading: categoriesLoading, addCategory } = useCategories(user?.uid || null);
  const { mappings, addMapping, deleteMapping } = useCategoryMappings(user?.uid || null);
  const { rules, addRule, updateRule, deleteRule, findConflict } = useRules(user?.uid || null);
  const { formatCurrency } = useCurrency();
  const isMobile = useIsMobile();
  const [selectedMonth, setSelectedMonth] = useState(
    () => localStorage.getItem(SELECTED_MONTH_KEY) || ALL_MONTHS
  );

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
  const [csvPreviewData, setCsvPreviewData] = useState<CsvRow[]>([]);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<string | null>(null);
  const [mobileSearchValue, setMobileSearchValue] = useState('');
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [mobileCategoryFilter, setMobileCategoryFilter] = useState('all');

  const [showAccountsModal, setShowAccountsModal] = useState(false);
  const [accountToDelete, setAccountToDelete] = useState<BankAccount | null>(null);
  const [deleteAccountTransactions, setDeleteAccountTransactions] = useState(false);

  const { bankAccounts, removeAccount } = useBankAccounts(user?.uid || null);

  const formatImportedCategory = (raw: string | undefined) => {
    if (!raw) return '';
    const formatted = raw.replace(/_/g, ' ');
    return formatted.charAt(0).toUpperCase() + formatted.slice(1).toLowerCase();
  };

  /**
   * Rules and bank-category mappings are applied here, on the way in. Rules were
   * previously only ever applied to the single transaction they were created
   * from, so the "applies to future transactions" promise never held.
   */
  const applyCategorization = useCallback(
    (txns: Transaction[]) => categorize(txns, rules, mappings),
    [rules, mappings]
  );

  // Save to localStorage whenever selectedMonth changes
  useEffect(() => {
    localStorage.setItem(SELECTED_MONTH_KEY, selectedMonth);
  }, [selectedMonth]);

  const months = useMemo(() => monthOptions(transactions), [transactions]);

  // A month stored by another page may no longer have any transactions.
  const activeMonth = months.includes(selectedMonth) ? selectedMonth : ALL_MONTHS;

  const [confirmFilter, setConfirmFilter] = useState<'all' | 'unconfirmed' | 'confirmed'>('all');

  const filteredTransactions = useMemo(() => {
    const byMonth = filterByMonth(transactions, activeMonth);
    if (confirmFilter === 'confirmed') return byMonth.filter(t => t.confirmed);
    if (confirmFilter === 'unconfirmed') return byMonth.filter(t => !t.confirmed);
    return byMonth;
  }, [transactions, activeMonth, confirmFilter]);

  /** The CSV column chosen for a field, or null when the user picked "No field". */
  const mappedField = (field: (typeof CSV_FIELDS)[number]): string | null => {
    const column = csvMappings[field];
    return column && column !== 'none' ? column : null;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so picking the same file again re-triggers onChange.
    e.target.value = '';
    if (!file) return;

    setCsvError(null);
    setImportSummary(null);

    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
      error: (error) => setCsvError(`Could not read that file: ${error.message}`),
      complete: (results) => {
        const rows = results.data.filter((row) => row && Object.keys(row).length > 0);

        if (rows.length === 0) {
          setCsvError('That file has no data rows.');
          return;
        }

        const headers = Object.keys(rows[0]).filter(Boolean);
        if (headers.length === 0) {
          setCsvError('That file has no column headers.');
          return;
        }

        const previewData = rows.slice(0, 2); // Get first 2 rows for preview
        
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
            const columnValues = rows
              .slice(0, 20) // Sample the first rows
              .map((row) => row[header])
              .filter((val) => val !== null && val !== undefined && val !== '');

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
          // Only pre-fill Category when a column was actually recognised;
          // defaulting to the 4th column mis-tagged unrelated data.
          Category: detectedCategoryColumn || 'none',
        });
        setShowMappingModal(true);
      },
    });
  };

  const handleSaveMapping = () => {
    if (!csvFile) return;

    const dateField = mappedField('Date');
    const amountField = mappedField('Amount');
    const descriptionField = mappedField('Description');
    const categoryField = mappedField('Category');

    if (!dateField || !amountField) {
      setCsvError('Pick which columns hold the date and the amount.');
      return;
    }

    setCsvError(null);

    Papa.parse<CsvRow>(csvFile, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
      error: (error) => setCsvError(`Could not read that file: ${error.message}`),
      complete: async (results) => {
        // Identical rows (two $5 coffees on the same day) hash to the same id, so
        // count repeats and pass the occurrence through to keep them distinct.
        const seen = new Map<string, number>();
        const newTransactions: Transaction[] = [];
        let skipped = 0;

        for (const row of results.data) {
          if (!row) continue;

          const rawDate = row[dateField];
          const rawAmount = row[amountField];
          if (!rawDate || rawAmount === undefined || rawAmount === '') continue;

          const amount = parseFloat(String(rawAmount).replace(/[^0-9.-]/g, ''));
          const date = parseDate(rawDate);

          // Firebase rejects NaN outright, which used to fail the whole import.
          if (!Number.isFinite(amount) || !parseTransactionDate(date)) {
            skipped++;
            continue;
          }

          const description = descriptionField ? row[descriptionField] || '' : '';
          const key = `${date}|${description}|${amount}`;
          const occurrence = seen.get(key) ?? 0;
          seen.set(key, occurrence + 1);

          newTransactions.push({
            id: createTransactionId({ Date: date, Description: description, Amount: amount }, occurrence),
            Date: date,
            Amount: amount,
            Description: description,
            Category: categoryField ? row[categoryField] || '' : '',
            confirmed: false,
          });
        }

        if (newTransactions.length === 0) {
          setCsvError('No rows in that file had a usable date and amount.');
          return;
        }

        const added = await addTransactions(applyCategorization(newTransactions));

        const parts = [`Imported ${added} transaction${added === 1 ? '' : 's'}`];
        const duplicates = newTransactions.length - added;
        if (duplicates > 0) parts.push(`${duplicates} already present`);
        if (skipped > 0) parts.push(`${skipped} skipped (unreadable date or amount)`);

        setImportSummary(parts.join(' · '));
        setShowMappingModal(false);
        setCsvFile(null);
      },
    });
  };

  const handleAddToBudget = async () => {
    if (!selectedTransaction?.importedCategory) return;
    const name = formatImportedCategory(selectedTransaction.importedCategory);
    const newCategoryId = Date.now();
    const newSubId = newCategoryId + 1;
    await addCategory({ id: newCategoryId, name, subcategories: [{ id: newSubId, name, amount: 0 }] });
    setSelectedCategory(name);
  };

  const handleSaveChanges = async () => {
    if (!selectedTransaction) return;

    const categoryToSave = selectedCategory || selectedTransaction.Category;

    if (selectedTransaction.importedCategory && selectedCategory) {
      await addMapping(selectedTransaction.importedCategory, selectedCategory);
      // Apply the new mapping to every transaction with the same bank category.
      const importedCat = selectedTransaction.importedCategory;
      await mutateTransactions(current =>
        current.map(t => {
          if (t.id === selectedTransaction.id) {
            return { ...t, Category: categoryToSave, hasRule: createRule };
          }
          return t.importedCategory === importedCat ? { ...t, Category: selectedCategory } : t;
        })
      );
    } else {
      await updateTransaction(selectedTransaction.id, {
        Category: categoryToSave,
        hasRule: createRule,
      });
    }

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
      await mutateTransactions(current =>
        current.map(t =>
          ruleMatches(t.Description, pendingRule.matchText)
            ? { ...t, Category: pendingRule.category, hasRule: true }
            : t
        )
      );
    }

    setShowRuleDialog(false);
    setPendingRule(null);
    setConflictingRule(null);
    setSelectedTransaction(null);
    setCreateRule(false);
    setIsOverridingRule(false);
  };

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
      header: ({ column }) => <SortableHeader column={column}>Date</SortableHeader>,
      sortingFn: (a, b) =>
        (parseTransactionDate(a.original.Date)?.getTime() ?? 0) -
        (parseTransactionDate(b.original.Date)?.getTime() ?? 0),
      cell: ({ row }) => (
        <div className="font-medium whitespace-nowrap">{formatTransactionDate(row.original.Date)}</div>
      ),
    },
    {
      accessorKey: "Description",
      header: ({ column }) => <SortableHeader column={column}>Description</SortableHeader>,
      cell: ({ row }) => {
        const transaction = row.original;
        if (isMobile) {
          const account = transaction.bankAccountId ? bankAccounts.find(a => a.id === transaction.bankAccountId) : null;
          return (
            <div className="min-w-0">
              <div className="truncate" title={String(row.getValue("Description") || '')}>
                {row.getValue("Description")}
              </div>
              {transaction.Category && (
                <div className="text-xs text-muted-foreground truncate">{transaction.Category}</div>
              )}
              {account && (
                <div className="text-xs text-muted-foreground truncate">{account.institutionName} · {account.name}</div>
              )}
            </div>
          );
        }
        return (
          <div className="min-w-0 lg:min-w-[200px] truncate" title={String(row.getValue("Description") || '')}>
            {row.getValue("Description")}
          </div>
        )
      },
    },
    {
      id: "account",
      header: "Account",
      // No accessorKey, so give the global filter searchable text (name +
      // institution) — otherwise "chase" matches nothing even though it shows.
      accessorFn: (transaction) => {
        if (!transaction.bankAccountId) return '';
        const account = bankAccounts.find(a => a.id === transaction.bankAccountId);
        return account ? `${account.name} ${account.institutionName}` : '';
      },
      cell: ({ row }) => {
        const transaction = row.original;
        if (!transaction.bankAccountId) return null;
        const account = bankAccounts.find(a => a.id === transaction.bankAccountId);
        if (!account) return null;
        return (
          <div className="text-sm text-muted-foreground whitespace-nowrap">
            <span className="font-medium text-foreground">{account.name}</span>
            <span className="ml-1">{account.institutionName}</span>
          </div>
        );
      },
    },
    {
      accessorKey: "Amount",
      header: ({ column }) => (
        <div className="text-right">
          <SortableHeader column={column}>Amount</SortableHeader>
        </div>
      ),
      cell: ({ row }) => {
        const transaction = row.original;
        const amount = parseFloat(String(row.getValue("Amount")));
        const formattedDate = formatTransactionDate(transaction.Date);
        if (isMobile) {
          return (
            <div className="text-right pr-4">
              <div className="font-medium">{formatCurrency(amount)}</div>
              <div className="text-xs text-muted-foreground">{formattedDate}</div>
            </div>
          );
        }
        return <div className="text-right font-medium pr-4">{formatCurrency(amount)}</div>
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
        const hasUnmappedImport = transaction.importedCategory && !transaction.Category;

        return (
          <div
            className={`w-full ml-4 flex items-center gap-2 ${!isValidCategory && transaction.Category ? 'text-destructive' : ''}`}
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
            {hasUnmappedImport && (
              <div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 shrink-0">
                <Tag className="h-3 w-3 shrink-0" />
                <span className="truncate" title={transaction.importedCategory}>{formatImportedCategory(transaction.importedCategory)}</span>
              </div>
            )}
          </div>
        )
      },
    },
    {
      accessorKey: "confirmed",
      // Pin the actions column to the right edge on desktop so Confirm/Unconfirm
      // stay reachable when the table overflows horizontally.
      meta: { className: "lg:sticky lg:right-0 bg-background" },
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
          <div className="group flex items-center justify-center w-full">
            <div className="grid grid-cols-3 items-center gap-2 w-full max-w-[300px]">
              <div className="flex justify-start">
                {transaction.confirmed && (
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
                )}
              </div>
              <div className="flex justify-center">
                {transaction.confirmed ? (
                  <Badge variant="outline" className="flex items-center gap-1.5 bg-green-50 dark:bg-green-950">
                    <div className="h-3.5 w-3.5 rounded-full bg-green-600 dark:bg-green-400 flex items-center justify-center">
                      <Check className="h-2 w-2 text-white stroke-[3]" />
                    </div>
                    Confirmed
                  </Badge>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span tabIndex={!transaction.Category ? 0 : undefined}>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!transaction.Category}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleConfirm(transaction.id);
                          }}
                        >
                          Confirm
                        </Button>
                      </span>
                    </TooltipTrigger>
                    {!transaction.Category && (
                      <TooltipContent>
                        Select a category before confirming
                      </TooltipContent>
                    )}
                  </Tooltip>
                )}
              </div>
              <div className="flex justify-end">
                {/* Empty spacer to balance layout */}
              </div>
            </div>
          </div>
        )
      },
    },
  ], [categories, handleCategoryChange, toggleConfirm, isMobile, bankAccounts, formatCurrency]);

  const isMobileSheetOpen = isMobile && isEditPanelOpen && !!selectedTransaction;

  return (
    <TooltipProvider>
      <Layout>
        <div className="flex flex-col min-h-0 flex-1">
        {/* Hidden file input shared between mobile and desktop */}
        <Input
          type="file"
          accept=".csv"
          onChange={handleFileUpload}
          className="hidden"
          id="csv-upload"
        />

        {/* Mobile Header */}
        <div className="lg:hidden sticky top-0 z-10 flex items-center justify-between bg-background border-b -mx-4 px-4 py-3">
          <h1 className="font-medium">Transactions</h1>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => setShowRulesPanel(true)} className="relative">
              <ListFilter className="h-4 w-4" />
              {rules.length > 0 && (
                <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-primary" />
              )}
              <span className="sr-only">Rules</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon">
                  <Plus className="h-4 w-4" />
                  <span className="sr-only">Add Transactions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => document.getElementById('csv-upload')?.click()}>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload CSV
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setShowAccountsModal(true)}>
                  <Building2 className="h-4 w-4 mr-2" />
                  Manage Imported Accounts
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Mobile Search + Filter Bar */}
        <div className="lg:hidden flex items-center gap-2 mt-3">
          <Input
            placeholder="Search transactions..."
            value={mobileSearchValue}
            onChange={(e) => setMobileSearchValue(e.target.value)}
            className="flex-1"
          />
          <Button
            variant="outline"
            size="icon"
            onClick={() => setShowMobileFilters(true)}
            className="relative shrink-0"
          >
            <SlidersHorizontal className="h-4 w-4" />
            {(activeMonth !== ALL_MONTHS || confirmFilter !== 'all') && (
              <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-primary" />
            )}
            <span className="sr-only">Filters</span>
          </Button>
        </div>

        {/* Desktop Header */}
        <div className="hidden lg:flex sticky top-0 z-10 h-16 justify-between items-center bg-background border-b -mx-6 px-6">
          <h1 className="font-medium">Transactions</h1>
          <div className="flex items-center gap-4">
            <Select value={activeMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select month" />
              </SelectTrigger>
              <SelectContent>
                {months.map(month => (
                  <SelectItem key={month} value={month}>{month}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={() => setShowRulesPanel(true)}
              className="flex items-center gap-2"
            >
              <ListFilter className="h-4 w-4" />
              Rules
              {rules.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                  {rules.length}
                </Badge>
              )}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  Add Transactions
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => document.getElementById('csv-upload')?.click()}>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload CSV
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setShowAccountsModal(true)}>
                  <Building2 className="h-4 w-4 mr-2" />
                  Manage Imported Accounts
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

      {(csvError || importSummary) && (
        <div className="mt-3 space-y-2">
          {csvError && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="flex-1">{csvError}</span>
              <button onClick={() => setCsvError(null)} className="shrink-0" aria-label="Dismiss">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {importSummary && (
            <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 text-sm">
              <Check className="h-4 w-4 shrink-0 text-green-600" />
              <span className="flex-1">{importSummary}</span>
              <button onClick={() => setImportSummary(null)} className="shrink-0" aria-label="Dismiss">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      <div className="lg:flex lg:items-start lg:gap-3 min-h-0 flex-1 lg:mt-4">
        <div
          className={`flex-1 min-w-0 transition-[padding,max-width] duration-300 flex flex-col min-h-0 ${
            isEditPanelOpen && selectedTransaction ? 'lg:pr-6' : ''
          }`}
        >
          <DataTable
            columns={columns}
            data={filteredTransactions}
            loading={transactionsLoading || categoriesLoading}
            searchPlaceholder="Search transactions..."
            categoryFilterKey="Category"
            categoryFilterGroups={isMobile ? [] : categoryGroups}
            categoryFilterPlaceholder="Filter by category"
            initialCategoryFilter={categoryFilterFromUrl}
            hideSearchBar={isMobile}
            externalGlobalFilter={isMobile ? mobileSearchValue : undefined}
            externalCategoryFilter={isMobile ? mobileCategoryFilter : undefined}

            extraFilters={isMobile ? undefined : (
              <Select value={confirmFilter} onValueChange={(v) => setConfirmFilter(v as 'all' | 'unconfirmed' | 'confirmed')}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Transactions</SelectItem>
                  <SelectItem value="unconfirmed">Unconfirmed</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                </SelectContent>
              </Select>
            )}
            forceHiddenColumnIds={isMobile ? ['select', 'Category', 'confirmed', 'Date', 'account'] : (isEditPanelOpen && selectedTransaction ? ['account'] : undefined)}
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
              <div className="flex items-start justify-between gap-2">
                <CardTitle>{selectedTransaction.Description}</CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 -mr-1 -mt-1"
                  aria-label="Close"
                  onClick={() => {
                    setIsEditPanelOpen(false);
                    setSelectedTransaction(null);
                    setIsOverridingRule(false);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="text-sm text-muted-foreground">
                  {formatTransactionDate(selectedTransaction.Date)}
                </div>
                <div className="text-2xl font-bold">
                  {formatCurrency(parseFloat(String(selectedTransaction.Amount)))}
                </div>
                {selectedTransaction.bankAccountId && (() => {
                  const account = bankAccounts.find(a => a.id === selectedTransaction.bankAccountId);
                  return account ? (
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-1">
                      <Building2 className="h-3.5 w-3.5 shrink-0" />
                      <span>{account.institutionName} · {account.name}</span>
                    </div>
                  ) : null;
                })()}
              </div>

              {selectedTransaction.importedCategory && (
                <div className="flex items-center justify-between rounded-md bg-muted/50 border px-3 py-2">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
                    <Tag className="h-3 w-3 shrink-0" />
                    <span className="truncate" title={selectedTransaction.importedCategory}>
                      Bank: <span className="font-medium text-foreground">{formatImportedCategory(selectedTransaction.importedCategory)}</span>
                    </span>
                  </div>
                  {!categories.some(cat => cat.subcategories.some(sub => sub.name === selectedTransaction.importedCategory)) && (
                    <Button variant="ghost" size="sm" className="h-6 text-xs shrink-0 ml-2" onClick={handleAddToBudget}>
                      + Add to budget
                    </Button>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium">Budget Category</label>
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

              {selectedTransaction.importedCategory && selectedCategory && (
                <p className="text-xs text-muted-foreground">
                  Saving will map all <strong>"{formatImportedCategory(selectedTransaction.importedCategory)}"</strong> bank transactions → <strong>"{selectedCategory}"</strong>
                </p>
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
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex-1" tabIndex={!selectedCategory ? 0 : undefined}>
                      <Button
                        onClick={handleSaveChanges}
                        className="w-full"
                        disabled={!selectedCategory}
                      >
                        Save
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {!selectedCategory && (
                    <TooltipContent>
                      Select a category before saving
                    </TooltipContent>
                  )}
                </Tooltip>
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
                      {formatTransactionDate(selectedTransaction.Date)}
                    </div>
                    <div className="text-2xl font-bold">
                      {formatCurrency(parseFloat(String(selectedTransaction.Amount)))}
                    </div>
                    {selectedTransaction.bankAccountId && (() => {
                      const account = bankAccounts.find(a => a.id === selectedTransaction.bankAccountId);
                      return account ? (
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-1">
                          <Building2 className="h-3.5 w-3.5 shrink-0" />
                          <span>{account.institutionName} · {account.name}</span>
                        </div>
                      ) : null;
                    })()}
                  </div>

                  {selectedTransaction.importedCategory && (
                    <div className="flex items-center justify-between rounded-md bg-muted/50 border px-3 py-2">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
                        <Tag className="h-3 w-3 shrink-0" />
                        <span className="truncate" title={selectedTransaction.importedCategory}>
                          Bank: <span className="font-medium text-foreground">{formatImportedCategory(selectedTransaction.importedCategory)}</span>
                        </span>
                      </div>
                      {!categories.some(cat => cat.subcategories.some(sub => sub.name === selectedTransaction.importedCategory)) && (
                        <Button variant="ghost" size="sm" className="h-6 text-xs shrink-0 ml-2" onClick={handleAddToBudget}>
                          + Add to budget
                        </Button>
                      )}
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Budget Category</label>
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

                  {selectedTransaction.importedCategory && selectedCategory && (
                    <p className="text-xs text-muted-foreground">
                      Saving will map all <strong>"{formatImportedCategory(selectedTransaction.importedCategory)}"</strong> bank transactions → <strong>"{selectedCategory}"</strong>
                    </p>
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
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="flex-1" tabIndex={!selectedCategory ? 0 : undefined}>
                          <Button
                            onClick={handleSaveChanges}
                            className="w-full"
                            disabled={!selectedCategory}
                          >
                            Save
                          </Button>
                        </span>
                      </TooltipTrigger>
                      {!selectedCategory && (
                        <TooltipContent>
                          Select a category before saving
                        </TooltipContent>
                      )}
                    </Tooltip>
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

            <div className="border-t pt-4 mt-2">
              <div className="flex items-center gap-1.5 mb-2">
                <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-sm font-medium">Bank Category Mappings</p>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                When you categorize a transaction, all transactions with the same bank category are updated automatically.
              </p>
              {Object.keys(mappings).length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No mappings yet. Assign a budget category to any bank transaction to create one.</p>
              ) : (
                <div className="space-y-2">
                  {Object.entries(mappings).map(([imported, budget]) => (
                    <div key={imported} className="flex items-start justify-between p-3 border rounded-md gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate" title={imported}>{formatImportedCategory(imported)}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">→ {budget}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="shrink-0 h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteMapping(imported)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </SheetContent>
        </Sheet>

        {/* Mobile Filters Sheet */}
        <Sheet open={showMobileFilters} onOpenChange={setShowMobileFilters}>
          <SheetContent side="bottom" className="lg:hidden rounded-t-lg">
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
            </SheetHeader>
            <div className="space-y-4 mt-4 pb-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Month</label>
                <Select value={activeMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select month" />
                  </SelectTrigger>
                  <SelectContent>
                    {months.map(month => (
                      <SelectItem key={month} value={month}>{month}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Category</label>
                <Select value={mobileCategoryFilter} onValueChange={setMobileCategoryFilter}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Filter by category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categoryGroups.map((group, index) => (
                      <React.Fragment key={group.id}>
                        <SelectGroup>
                          <SelectLabel>{group.name}</SelectLabel>
                          {group.subcategories.map(sub => (
                            <SelectItem key={sub.id} value={sub.value}>
                              {sub.label || sub.value}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                        {index < categoryGroups.length - 1 && <SelectSeparator />}
                      </React.Fragment>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Status</label>
                <Select value={confirmFilter} onValueChange={(v) => setConfirmFilter(v as 'all' | 'unconfirmed' | 'confirmed')}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Transactions</SelectItem>
                    <SelectItem value="unconfirmed">Unconfirmed</SelectItem>
                    <SelectItem value="confirmed">Confirmed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(activeMonth !== ALL_MONTHS || confirmFilter !== 'all' || mobileCategoryFilter !== 'all') && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setSelectedMonth(ALL_MONTHS);
                    setConfirmFilter('all');
                    setMobileCategoryFilter('all');
                  }}
                >
                  Clear Filters
                </Button>
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
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={!pendingRule?.category ? 0 : undefined}>
                    <Button
                      onClick={handleConfirmRule}
                      disabled={!pendingRule?.category}
                    >
                      {conflictingRule ? 'Override Rule' : 'Create Rule'}
                    </Button>
                  </span>
                </TooltipTrigger>
                {!pendingRule?.category && (
                  <TooltipContent>
                    Select a category before confirming
                  </TooltipContent>
                )}
              </Tooltip>
            </DialogFooter>
          </ResponsiveDialogContent>
        </ResponsiveDialog>

        <ResponsiveDialog open={showMappingModal} onOpenChange={setShowMappingModal}>
          <ResponsiveDialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Match CSV Columns</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {csvError && (
                <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{csvError}</span>
                </div>
              )}
              {/* Horizontal table-like mapping with dropdowns */}
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b">
                      {CSV_FIELDS.map(field => (
                        <th key={field} className="text-left p-3 font-medium">
                          {field}
                          {(field === 'Date' || field === 'Amount') && (
                            <span className="text-destructive"> *</span>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      {CSV_FIELDS.map(field => (
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
                          const dateField = mappedField('Date');
                          const descriptionField = mappedField('Description');
                          const amountField = mappedField('Amount');
                          const categoryField = mappedField('Category');

                          const rawDate = dateField ? row[dateField] : undefined;
                          const formattedDate = rawDate ? formatTransactionDate(parseDate(rawDate)) : '';

                          const rawAmount = amountField ? row[amountField] : undefined;
                          const amount = rawAmount !== undefined
                            ? parseFloat(String(rawAmount).replace(/[^0-9.-]/g, ''))
                            : NaN;
                          const formattedAmount = Number.isFinite(amount)
                            ? formatCurrency(amount)
                            : (rawAmount ? String(rawAmount) : '');

                          const description = descriptionField ? String(row[descriptionField] ?? '') : '';
                          const category = categoryField ? String(row[categoryField] ?? '') : '';

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
              <Button
                onClick={handleSaveMapping}
                disabled={!mappedField('Date') || !mappedField('Amount')}
              >
                Import Transactions
              </Button>
            </DialogFooter>
          </ResponsiveDialogContent>
        </ResponsiveDialog>

        {/* Connected Accounts Modal */}
        <ResponsiveDialog open={showAccountsModal} onOpenChange={setShowAccountsModal}>
          <ResponsiveDialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Imported Accounts
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              {bankAccounts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No accounts. Transactions are added with Upload CSV.
                </p>
              ) : (
                <div className="space-y-2">
                  {bankAccounts.map((account) => (
                    <div
                      key={account.id}
                      className="flex items-center justify-between rounded-md border px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{account.institutionName}</p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {account.name} · {account.subtype}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 ml-4 shrink-0">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-muted-foreground hover:text-destructive h-8 w-8 p-0"
                          onClick={() => {
                            setAccountToDelete(account);
                            setDeleteAccountTransactions(false);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </ResponsiveDialogContent>
        </ResponsiveDialog>

        {/* Delete Account Confirmation Modal */}
        <ResponsiveDialog
          open={!!accountToDelete}
          onOpenChange={(open) => { if (!open) setAccountToDelete(null); }}
        >
          <ResponsiveDialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-4 w-4" />
                Remove Account
              </DialogTitle>
              <DialogDescription>
                Remove <strong>{accountToDelete?.institutionName}</strong> ({accountToDelete?.name})?
                Its imported transactions are kept unless you choose otherwise.
              </DialogDescription>
            </DialogHeader>
            <div className="py-2">
              <label className="flex items-start gap-3 cursor-pointer">
                <Checkbox
                  id="delete-transactions"
                  checked={deleteAccountTransactions}
                  onCheckedChange={(checked) => setDeleteAccountTransactions(!!checked)}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm font-medium">Also delete this account's transactions</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Remove all transactions imported from this account
                  </p>
                </div>
              </label>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAccountToDelete(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  if (!accountToDelete) return;
                  if (deleteAccountTransactions) {
                    await deleteTransactionsByAccount(accountToDelete.id);
                  }
                  await removeAccount(accountToDelete.id);
                  setAccountToDelete(null);
                }}
              >
                Remove Account
              </Button>
            </DialogFooter>
          </ResponsiveDialogContent>
        </ResponsiveDialog>
        </div>
      </Layout>
    </TooltipProvider>
  );
}

