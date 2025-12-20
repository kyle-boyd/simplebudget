import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ColumnDef } from '@tanstack/react-table';
import { ArrowUpDown, Check } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel, SelectSeparator } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { DataTable } from '@/components/ui/data-table';
import { useAuth } from '@/hooks/useAuth';
import { useTransactions, Transaction } from '@/hooks/useTransactions';
import { useCategories } from '@/hooks/useCategories';
import { formatCurrency, createTransactionId } from '@/lib/utils';
import Papa from 'papaparse';

const SELECTED_MONTH_KEY = 'selectedMonth';

export function Transactions() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const { transactions, addTransactions, updateTransaction, toggleConfirm } = useTransactions(user?.uid || null);
  const { categories } = useCategories(user?.uid || null);
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
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvMappings, setCsvMappings] = useState<Record<string, string>>({});
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      complete: (results) => {
        if (results.data && results.data.length > 0) {
          const headers = Object.keys(results.data[0] as object);
          setCsvFile(file);
          setCsvHeaders(headers);
          setCsvMappings({
            Date: headers[0] || '',
            Amount: headers[1] || '',
            Description: headers[2] || '',
            Category: headers[3] || '',
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
          .filter(t => t[csvMappings.Date] && t[csvMappings.Amount])
          .map(t => {
            const amount = parseFloat(String(t[csvMappings.Amount]).replace(/[^0-9.-]/g, ''));
            return {
              id: createTransactionId({
                Date: t[csvMappings.Date],
                Description: t[csvMappings.Description] || '',
                Amount: amount
              }),
              Date: t[csvMappings.Date],
              Amount: amount,
              Description: t[csvMappings.Description] || '',
              Category: t[csvMappings.Category] || '',
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
    setSelectedTransaction(null);
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
          day: 'numeric'
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
        return <div className="min-w-[200px]">{row.getValue("Description")}</div>
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
        const amount = parseFloat(String(row.getValue("Amount")));
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
  ], [categories, categoryOptions, handleCategoryChange, toggleConfirm]);

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
            <Input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="hidden"
              id="csv-upload"
            />
            <Button asChild className="w-full sm:w-auto">
              <label htmlFor="csv-upload" className="cursor-pointer">
                Upload Transactions
              </label>
            </Button>
          </div>
        </div>

      <div className="lg:flex lg:items-start lg:gap-6">
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
            onRowClick={(transaction) => {
              setSelectedTransaction(transaction);
              setSelectedCategory(transaction.Category || '');
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
                    parseInt(selectedTransaction.Date.split('/')[1])).toLocaleDateString()}
                </div>
                <div className="text-2xl font-bold">
                  {formatCurrency(parseFloat(String(selectedTransaction.Amount)))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Category</label>
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
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

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="create-rule"
                  checked={createRule}
                  onCheckedChange={(checked) => setCreateRule(checked as boolean)}
                />
                <label htmlFor="create-rule" className="text-sm">
                  Always categorize as: <strong>{selectedCategory || 'Select Category'}</strong>
                </label>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setIsEditPanelOpen(false)}
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
          className="lg:hidden" 
          hideOverlay
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
            {selectedTransaction && (
              <>
                <SheetHeader>
                  <SheetTitle>{selectedTransaction.Description}</SheetTitle>
                </SheetHeader>
                <div className="space-y-4 mt-4" onClick={(e) => e.stopPropagation()}>
                  <div>
                    <div className="text-sm text-muted-foreground">
                      {new Date(2000 + parseInt(selectedTransaction.Date.split('/')[2]), 
                        parseInt(selectedTransaction.Date.split('/')[0]) - 1, 
                        parseInt(selectedTransaction.Date.split('/')[1])).toLocaleDateString()}
                    </div>
                    <div className="text-2xl font-bold">
                      {formatCurrency(parseFloat(String(selectedTransaction.Amount)))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Category</label>
                    <Select value={selectedCategory} onValueChange={setSelectedCategory}>
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

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="create-rule-mobile"
                      checked={createRule}
                      onCheckedChange={(checked) => setCreateRule(checked as boolean)}
                    />
                    <label htmlFor="create-rule-mobile" className="text-sm">
                      Always categorize as: <strong>{selectedCategory || 'Select Category'}</strong>
                    </label>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setIsEditPanelOpen(false)}
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

        <Dialog open={showMappingModal} onOpenChange={setShowMappingModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Match CSV Columns</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {['Date', 'Amount', 'Description', 'Category'].map(field => (
                <div key={field} className="space-y-2">
                  <label className="text-sm font-medium">{field}</label>
                  <Select
                    value={csvMappings[field] || ''}
                    onValueChange={(value) => setCsvMappings({ ...csvMappings, [field]: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={`Select ${field} column`} />
                    </SelectTrigger>
                    <SelectContent>
                      {csvHeaders.map(header => (
                        <SelectItem key={header} value={header}>{header}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowMappingModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveMapping}>Save Mapping</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}

