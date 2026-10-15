import { useCallback, useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AmountInput } from '@/components/ui/amount-input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { ResponsiveDialog, ResponsiveDialogContent } from '@/components/ui/responsive-dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/useAuth';
import { useCurrency } from '@/hooks/useUserSettings';
import { useCategories, Category, Subcategory } from '@/hooks/useCategories';
import { useTransactions } from '@/hooks/useTransactions';
import { useRules } from '@/hooks/useRules';
import { useCategoryMappings } from '@/hooks/useCategoryMappings';
import {
  referencesTo,
  renameCategoryInTransactions,
  transactionsUsingCategory,
} from '@/lib/categorization';
import {
  ALL_MONTHS,
  filterByMonth,
  monthOptions,
} from '@/lib/months';
import { ChevronRight, FolderInput, Pencil, Plus, Trash2 } from 'lucide-react';

const SELECTED_MONTH_KEY = 'selectedMonth';

export function Budget() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { categories, addCategory, updateCategory, deleteCategory, addSubcategory, updateSubcategory, deleteSubcategory, moveSubcategory } = useCategories(user?.uid || null);
  const { transactions, mutateTransactions } = useTransactions(user?.uid || null);
  const { rules, updateRule, deleteRule } = useRules(user?.uid || null);
  const { mappings, deleteMapping } = useCategoryMappings(user?.uid || null);
  const { formatCurrency } = useCurrency();
  const [selectedMonth, setSelectedMonth] = useState(
    () => localStorage.getItem(SELECTED_MONTH_KEY) || ALL_MONTHS
  );
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<{ category?: Category; subcategory?: Subcategory; parentId?: number } | null>(null);
  const [formData, setFormData] = useState({ name: '' });
  const [editingNames, setEditingNames] = useState<{ [key: number]: string }>({});
  const [modalAmount, setModalAmount] = useState(0);
  const [modalKind, setModalKind] = useState<'fixed' | 'flexible'>('flexible');
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [deletingSubcategoryId, setDeletingSubcategoryId] = useState<number | null>(null);
  const [nameError, setNameError] = useState<string>('');
  const [mobileSheet, setMobileSheet] = useState<{
    type: 'subcategory' | 'category';
    sub?: Subcategory;
    category?: Category;
    parentId?: number;
  } | null>(null);
  const [mobileSheetName, setMobileSheetName] = useState('');
  const [mobileSheetParentId, setMobileSheetParentId] = useState<number | null>(null);
  const [mobileSheetAmount, setMobileSheetAmount] = useState(0);
  const [mobileSheetKind, setMobileSheetKind] = useState<'fixed' | 'flexible'>('flexible');
  const [mobileSheetDeleteConfirm, setMobileSheetDeleteConfirm] = useState(false);

  // Save to localStorage whenever selectedMonth changes
  useEffect(() => {
    localStorage.setItem(SELECTED_MONTH_KEY, selectedMonth);
  }, [selectedMonth]);

  // Close delete confirmation when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (deletingSubcategoryId !== null) {
        const target = event.target as HTMLElement;
        if (!target.closest('.delete-confirmation-popover') && !target.closest('button[title="Delete subcategory"]')) {
          setDeletingSubcategoryId(null);
        }
      }
    };

    if (deletingSubcategoryId !== null) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [deletingSubcategoryId]);

  const months = useMemo(() => monthOptions(transactions), [transactions]);

  // A month stored by another page may no longer have any transactions.
  const activeMonth = months.includes(selectedMonth) ? selectedMonth : ALL_MONTHS;

  const filteredTransactions = useMemo(
    () => filterByMonth(transactions, activeMonth),
    [transactions, activeMonth]
  );

  /**
   * Spend per subcategory: the actual total for the selected month, or the sum
   * across every month for "All Months". (It previously divided the all-time
   * total by the three most recent months — a stealth average that rendered
   * under a "Spent" label, so one -$38.52 charge showed as $12.84.)
   */
  const spendingBySubcategory = useMemo(() => {
    const totals = new Map<string, number>();

    const add = (name: string | undefined, amount: number) => {
      const key = name?.trim();
      if (!key || !Number.isFinite(amount)) return;
      totals.set(key, (totals.get(key) || 0) + Math.abs(amount));
    };

    const source = activeMonth === ALL_MONTHS ? transactions : filteredTransactions;
    for (const transaction of source) {
      add(transaction.Category, transaction.Amount);
    }

    return totals;
  }, [activeMonth, filteredTransactions, transactions]);

  const getSubcategorySpending = useCallback(
    (subcategoryName: string): number => spendingBySubcategory.get(subcategoryName.trim()) || 0,
    [spendingBySubcategory]
  );

  const getCategorySpending = useCallback(
    (category: Category): number =>
      (category.subcategories || []).reduce(
        (sum, sub) => sum + getSubcategorySpending(sub.name),
        0
      ),
    [getSubcategorySpending]
  );

  /**
   * Transactions, rules and mappings all reference categories by *name*, so a
   * rename has to be propagated or every transaction filed under the old name is
   * orphaned: it renders as an invalid category and drops out of the budget.
   */
  const cascadeRename = useCallback(async (oldName: string, newName: string) => {
    if (!oldName || oldName.trim() === newName.trim()) return;

    await mutateTransactions(current =>
      renameCategoryInTransactions(current, oldName, newName)
    );

    const stale = referencesTo([oldName], rules, mappings);
    await Promise.all(stale.rules.map(rule => updateRule(rule.id, { category: newName })));
    await Promise.all(stale.mappings.map(imported => deleteMapping(imported)));
  }, [rules, mappings, mutateTransactions, updateRule, deleteMapping]);

  /**
   * Un-files transactions whose category is gone and drops rules and mappings
   * that pointed at it. Takes every removed name at once: a per-name loop would
   * write the whole transaction list repeatedly and lose the earlier passes.
   */
  const cascadeDelete = useCallback(async (names: string[]) => {
    const targets = new Set(
      names.map(name => name.trim().toLowerCase()).filter(Boolean)
    );
    if (targets.size === 0) return;

    await mutateTransactions(current =>
      current.map(transaction =>
        targets.has((transaction.Category || '').trim().toLowerCase())
          ? { ...transaction, Category: '', confirmed: false }
          : transaction
      )
    );

    const stale = referencesTo(names, rules, mappings);
    await Promise.all(stale.rules.map(rule => deleteRule(rule.id)));
    await Promise.all(stale.mappings.map(imported => deleteMapping(imported)));
  }, [rules, mappings, mutateTransactions, deleteRule, deleteMapping]);

  /** How many transactions a delete would un-file, for the confirmation prompt. */
  const countAffected = useCallback(
    (names: string[]) =>
      names.reduce((sum, name) => sum + transactionsUsingCategory(transactions, name).length, 0),
    [transactions]
  );

  const handleAddCategory = () => {
    setEditingCategory(null);
    setFormData({ name: '' });
    setModalAmount(0);
    setModalKind('flexible');
    setShowDeleteConfirmation(false);
    setNameError('');
    setIsModalOpen(true);
  };

  const handleEditCategory = (category: Category) => {
    if (category.isSystem) return;
    setEditingCategory({ category });
    setFormData({ name: category.name });
    setModalAmount(0);
    setModalKind(category.kind === 'fixed' ? 'fixed' : 'flexible');
    setShowDeleteConfirmation(false);
    setNameError('');
    setIsModalOpen(true);
  };

  const handleEditSubcategory = (subcategory: Subcategory) => {
    if (subcategory.isSystem) return;
    // Put the name in edit mode
    setEditingNames({ ...editingNames, [subcategory.id]: subcategory.name });
  };

  const handleAddSubcategory = (parentId: number) => {
    const newSubcategory: Subcategory = {
      id: Date.now(),
      name: '',
      amount: 0,
    };
    addSubcategory(parentId, newSubcategory);
    // Put the name in edit mode
    setEditingNames({ ...editingNames, [newSubcategory.id]: '' });
  };

  const handleNameChange = (subcategoryId: number, newName: string) => {
    setEditingNames({ ...editingNames, [subcategoryId]: newName });
  };

  const handleNameBlur = async (subcategoryId: number, parentId: number) => {
    const nameValue = editingNames[subcategoryId] || '';
    const trimmedName = nameValue.trim();

    // Find the subcategory
    const category = categories.find(c => c.id === parentId);
    const subcategory = (category?.subcategories || []).find(s => s.id === subcategoryId);

    if (!subcategory) return;

    // If name is empty and it's a new subcategory (no name set), remove it
    if (!trimmedName && !subcategory.name) {
      deleteSubcategory(parentId, subcategoryId);
      const newEditingNames = { ...editingNames };
      delete newEditingNames[subcategoryId];
      setEditingNames(newEditingNames);
      return;
    }

    // If name is empty but subcategory already has a name, keep the original
    if (!trimmedName && subcategory.name) {
      const newEditingNames = { ...editingNames };
      delete newEditingNames[subcategoryId];
      setEditingNames(newEditingNames);
      return;
    }

    // Check for duplicate names
    const duplicateSubcategory = categories.some(c =>
      (c.subcategories || []).some(s => 
        s.id !== subcategoryId && 
        s.name.trim().toLowerCase() === trimmedName.toLowerCase()
      )
    );

    const duplicateCategory = categories.some(c =>
      c.name.trim().toLowerCase() === trimmedName.toLowerCase()
    );

    if (duplicateSubcategory || duplicateCategory) {
      // Don't save if duplicate, but keep editing
      return;
    }

    // Update the subcategory name
    await updateSubcategory(parentId, subcategoryId, {
      name: trimmedName,
      amount: subcategory.amount || 0,
    });
    await cascadeRename(subcategory.name, trimmedName);

    // Clear editing state
    const newEditingNames = { ...editingNames };
    delete newEditingNames[subcategoryId];
    setEditingNames(newEditingNames);
  };

  const handleNameKeyDown = (e: React.KeyboardEvent, subcategoryId: number, parentId: number) => {
    if (e.key === 'Enter') {
      (e.currentTarget as HTMLInputElement).blur();
    } else if (e.key === 'Escape') {
      const category = categories.find(c => c.id === parentId);
      const subcategory = (category?.subcategories || []).find(s => s.id === subcategoryId);
      
      // If it's a new subcategory with no name, remove it
      if (subcategory && !subcategory.name) {
        deleteSubcategory(parentId, subcategoryId);
      }
      
      const newEditingNames = { ...editingNames };
      delete newEditingNames[subcategoryId];
      setEditingNames(newEditingNames);
    }
  };

  const handleSave = async () => {
    const trimmedName = formData.name.trim();
    if (!trimmedName) return;

    const lowered = trimmedName.toLowerCase();
    const editedCategoryId = editingCategory?.category?.id;
    const editedSubcategoryId = editingCategory?.subcategory?.id;

    // Names are the identity used by transactions and rules, so they have to be
    // unique across both categories and subcategories.
    if (categories.some(c => c.id !== editedCategoryId && c.name.trim().toLowerCase() === lowered)) {
      setNameError('A category with this name already exists');
      return;
    }
    if (categories.some(c =>
      (c.subcategories || []).some(sub =>
        sub.id !== editedSubcategoryId && sub.name.trim().toLowerCase() === lowered
      )
    )) {
      setNameError('A subcategory with this name already exists');
      return;
    }

    setNameError('');

    if (editingCategory?.category) {
      await updateCategory(editingCategory.category.id, { name: trimmedName, kind: modalKind });
      await cascadeRename(editingCategory.category.name, trimmedName);
    } else if (editingCategory?.subcategory && editingCategory.parentId) {
      await updateSubcategory(editingCategory.parentId, editingCategory.subcategory.id, {
        name: trimmedName,
        amount: modalAmount,
      });
      await cascadeRename(editingCategory.subcategory.name, trimmedName);
    } else if (editingCategory?.parentId) {
      await addSubcategory(editingCategory.parentId, {
        id: Date.now(),
        name: trimmedName,
        amount: modalAmount,
      });
    } else {
      await addCategory({
        id: Date.now(),
        name: trimmedName,
        subcategories: [],
        kind: modalKind,
      });
    }

    setIsModalOpen(false);
    setEditingCategory(null);
    setFormData({ name: '' });
    setModalAmount(0);
    setShowDeleteConfirmation(false);
    setNameError('');
  };

  const handleDeleteClick = () => {
    setShowDeleteConfirmation(true);
  };

  const handleDeleteCancel = () => {
    setShowDeleteConfirmation(false);
  };

  const handleDeleteConfirm = async () => {
    if (!editingCategory) return;

    if (editingCategory.category) {
      const names = [
        editingCategory.category.name,
        ...(editingCategory.category.subcategories || []).map(sub => sub.name),
      ];
      await deleteCategory(editingCategory.category.id);
      await cascadeDelete(names);
    } else if (editingCategory.subcategory && editingCategory.parentId) {
      const { name } = editingCategory.subcategory;
      await deleteSubcategory(editingCategory.parentId, editingCategory.subcategory.id);
      await cascadeDelete([name]);
    }

    setIsModalOpen(false);
    setEditingCategory(null);
    setFormData({ name: '' });
    setModalAmount(0);
    setShowDeleteConfirmation(false);
  };

  const openMobileSubSheet = (sub: Subcategory, parentId: number) => {
    setMobileSheet({ type: 'subcategory', sub, parentId });
    setMobileSheetName(sub.name);
    setMobileSheetAmount(sub.amount || 0);
    setMobileSheetParentId(parentId);
    setMobileSheetDeleteConfirm(false);
  };

  const openMobileCatSheet = (category: Category) => {
    setMobileSheet({ type: 'category', category });
    setMobileSheetName(category.name);
    setMobileSheetAmount(category.amount || 0);
    setMobileSheetKind(category.kind === 'fixed' ? 'fixed' : 'flexible');
    setMobileSheetDeleteConfirm(false);
  };

  const handleMobileSheetSave = async () => {
    if (!mobileSheet) return;
    const trimmedName = mobileSheetName.trim();
    if (!trimmedName) return;

    if (mobileSheet.type === 'subcategory' && mobileSheet.sub && mobileSheet.parentId) {
      const previousName = mobileSheet.sub.name;
      const targetParentId = mobileSheetParentId ?? mobileSheet.parentId;
      // Reparent and the name/amount edit go in one write (moveSubcategory
      // applies the updates itself) so the second call can't clobber the first.
      await moveSubcategory(mobileSheet.parentId, targetParentId, mobileSheet.sub.id, {
        name: trimmedName,
        amount: mobileSheetAmount,
      });
      await cascadeRename(previousName, trimmedName);
    } else if (mobileSheet.type === 'category' && mobileSheet.category) {
      const previousName = mobileSheet.category.name;
      const hasSubcategories = (mobileSheet.category.subcategories || []).length > 0;
      await updateCategory(mobileSheet.category.id, {
        name: trimmedName,
        kind: mobileSheetKind,
        // A parent with subcategories derives its budget from them.
        ...(hasSubcategories ? {} : { amount: mobileSheetAmount }),
      });
      await cascadeRename(previousName, trimmedName);
    }

    setMobileSheet(null);
    setMobileSheetDeleteConfirm(false);
  };

  const handleMobileSheetDelete = async () => {
    if (!mobileSheet) return;

    if (mobileSheet.type === 'subcategory' && mobileSheet.sub && mobileSheet.parentId) {
      const { name } = mobileSheet.sub;
      await deleteSubcategory(mobileSheet.parentId, mobileSheet.sub.id);
      await cascadeDelete([name]);
    } else if (mobileSheet.type === 'category' && mobileSheet.category) {
      const names = [
        mobileSheet.category.name,
        ...(mobileSheet.category.subcategories || []).map(sub => sub.name),
      ];
      await deleteCategory(mobileSheet.category.id);
      await cascadeDelete(names);
    }

    setMobileSheet(null);
    setMobileSheetDeleteConfirm(false);
  };

  const mobileSheetAffectedCount = mobileSheet
    ? countAffected(
        mobileSheet.type === 'subcategory'
          ? [mobileSheet.sub?.name ?? '']
          : [
              mobileSheet.category?.name ?? '',
              ...(mobileSheet.category?.subcategories || []).map(sub => sub.name),
            ]
      )
    : 0;

  const regularCategories = categories.filter(cat => !cat.isSystem);
  const systemCategory = categories.find(cat => cat.isSystem);

  return (
    <Layout>
      <div className="space-y-6">
        <div className="sticky top-0 lg:top-0 z-10 h-auto lg:h-16 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 lg:gap-0 bg-sb-ground/90 backdrop-blur border-b border-sb-hairline -mx-4 lg:-mx-6 px-4 lg:px-6 py-4 lg:py-0">
          <h1 className="text-xl font-bold tracking-tight">Budget</h1>
          <div className="flex flex-col lg:flex-row gap-4 w-full lg:w-auto">
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
            <Button onClick={handleAddCategory} className="w-full lg:w-auto">
              + New Category
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          {regularCategories.map(category => {
            const hasSubcategories = (category.subcategories || []).length > 0;
            const totalAmount = hasSubcategories
              ? (category.subcategories || []).reduce((sum, sub) => sum + (sub.amount || 0), 0)
              : (category.amount || 0);
            const categorySpending = getCategorySpending(category);
            const isOverBudget = categorySpending > totalAmount;
            return (
              <Card key={category.id} className="shadow-none">
                <CardContent className="p-0">
                  <div className="space-y-4">
                    {/* Category Header */}
                    <div className="border-b py-2">
                      {/* Mobile category header */}
                      {!category.isSystem ? (
                        <button
                          className="lg:hidden flex items-center justify-between w-full px-6 py-1 text-left"
                          onClick={() => openMobileCatSheet(category)}
                        >
                          <span className="font-semibold">{category.name}</span>
                          <div className="flex items-center gap-2">
                            <span>
                              <span className={`text-sm font-medium ${isOverBudget ? 'text-sb-over-text' : 'text-sb-positive-text'}`}>
                                {formatCurrency(categorySpending)}
                              </span>
                              <span className="text-sm font-medium text-foreground"> of {formatCurrency(totalAmount)}</span>
                            </span>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </button>
                      ) : (
                        <div className="lg:hidden flex items-center px-6 py-1">
                          <span className="font-semibold">{category.name}</span>
                        </div>
                      )}
                      {/* Desktop category header */}
                      <div className="hidden lg:flex items-center justify-between gap-2 group px-8">
                      <div className="flex items-center gap-2 flex-1">
                        <span className="font-semibold">{category.name}</span>
                        {!category.isSystem && category.kind === 'fixed' && (
                          <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">Fixed</span>
                        )}
                        {!category.isSystem && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditCategory(category)}
                            className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                      <div className="flex items-center gap-3 lg:gap-16">
                        <div className="text-right w-[80px] lg:w-[120px]">
                          <div className="text-sm text-muted-foreground">Budget</div>
                          {hasSubcategories ? (
                            <div className="font-semibold">{formatCurrency(totalAmount)}</div>
                          ) : (
                            <AmountInput
                              value={category.amount}
                              onCommit={(amount) => updateCategory(category.id, { amount })}
                              className="h-8 w-[80px] lg:w-[120px] text-right font-semibold"
                            />
                          )}
                        </div>
                        <div className="text-right min-w-[60px] lg:min-w-[100px]">
                          <div className="text-sm text-muted-foreground">Spent</div>
                          <div className={`font-semibold ${isOverBudget ? 'text-sb-over-text' : 'text-sb-positive-text'}`}>
                            {formatCurrency(categorySpending)}
                          </div>
                        </div>
                        {!category.isSystem ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleAddSubcategory(category.id)}
                            className="h-8 w-8 p-0"
                            title="Add Subcategory"
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        ) : (
                          <div className="h-8 w-8" />
                        )}
                      </div>
                    </div>
                    </div>
                  </div>
                </CardContent>

                {/* Subcategories */}
                <div>
                      {(category.subcategories || []).map((sub, index) => {
                        const spending = getSubcategorySpending(sub.name);
                        const budget = sub.amount || 0;
                        const isSubOverBudget = spending > budget;
                        // Automatically edit if no name or explicitly in edit mode
                        const isEditingName = editingNames[sub.id] !== undefined || !sub.name;
                        const displayName = isEditingName ? (editingNames[sub.id] ?? '') : sub.name;
                        const isLast = index === (category.subcategories || []).length - 1;
                        
                        return (
                          <div key={sub.id} className={`${!isLast ? 'border-b' : ''}`}>
                            {sub.name && !sub.isSystem && (
                              <button
                                className="lg:hidden flex items-center justify-between w-full py-3 px-6 text-left"
                                onClick={() => openMobileSubSheet(sub, category.id)}
                              >
                                <span className="font-medium">{sub.name}</span>
                                <div className="flex items-center gap-2">
                                  <span>
                                    <span className={`text-sm ${isSubOverBudget ? 'text-sb-over-text' : 'text-sb-positive-text'}`}>
                                      {formatCurrency(spending)}
                                    </span>
                                    <span className="text-sm text-foreground"> of {formatCurrency(budget)}</span>
                                  </span>
                                  <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                </div>
                              </button>
                            )}
                            <div className={`${sub.name && !sub.isSystem ? 'hidden lg:flex' : 'flex'} items-center justify-between gap-2 py-1 group px-6 lg:px-8`}>
                            <div className="flex items-center gap-2 flex-1">
                              {isEditingName ? (
                                <Input
                                  type="text"
                                  value={displayName}
                                  onChange={(e) => handleNameChange(sub.id, e.target.value)}
                                  onBlur={() => handleNameBlur(sub.id, category.id)}
                                  onKeyDown={(e) => handleNameKeyDown(e, sub.id, category.id)}
                                  className="h-8 flex-1 max-w-[200px]"
                                  autoFocus
                                  placeholder="Subcategory name"
                                />
                              ) : (
                                <>
                                  <span 
                                    onClick={(e) => {
                                      // Navigate if clicking the span (but not if clicking the edit button)
                                      const target = e.target as HTMLElement;
                                      if (sub.name && !target.closest('button')) {
                                        navigate(`/transactions?category=${encodeURIComponent(sub.name)}`);
                                      }
                                    }}
                                    className={sub.name ? "cursor-pointer hover:text-primary transition-colors" : ""}
                                    title={sub.name ? "Click to view transactions for this subcategory" : ""}
                                  >
                                    {sub.name || 'New Subcategory'}
                                  </span>
                                  {!sub.isSystem && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleEditSubcategory(sub);
                                      }}
                                      className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                </>
                              )}
                            </div>
                            <div className="flex items-center gap-3 lg:gap-16">
                              <div className="text-right">
                                <AmountInput
                                  value={sub.amount}
                                  onCommit={(amount) =>
                                    updateSubcategory(category.id, sub.id, { name: sub.name, amount })
                                  }
                                  className="h-8 w-[80px] lg:w-[120px] text-right"
                                />
                              </div>
                              <div className="text-right min-w-[60px] lg:min-w-[100px]">
                                <div className={`font-medium ${isSubOverBudget ? 'text-sb-over-text' : 'text-sb-positive-text'}`}>
                                  {formatCurrency(spending)}
                                </div>
                              </div>
                              {!sub.isSystem ? (
                                <div className="relative flex items-center">
                                  {regularCategories.length > 1 && sub.name && (
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-8 w-8 p-0 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity"
                                          title="Move to another category"
                                        >
                                          <FolderInput className="h-4 w-4" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end">
                                        <DropdownMenuLabel>Move to</DropdownMenuLabel>
                                        <DropdownMenuSeparator />
                                        {regularCategories
                                          .filter(target => target.id !== category.id)
                                          .map(target => (
                                            <DropdownMenuItem
                                              key={target.id}
                                              onSelect={() => moveSubcategory(category.id, target.id, sub.id)}
                                            >
                                              {target.name}
                                            </DropdownMenuItem>
                                          ))}
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  )}
                                  {deletingSubcategoryId === sub.id ? (
                                    <div className="delete-confirmation-popover absolute right-full mr-2 bg-popover border rounded-md shadow-lg p-3 flex items-center gap-3 whitespace-nowrap z-10">
                                      <span className="text-sm">
                                        Are you sure?
                                        {countAffected([sub.name]) > 0 && (
                                          <span className="text-muted-foreground">
                                            {' '}
                                            {countAffected([sub.name])} transaction
                                            {countAffected([sub.name]) === 1 ? '' : 's'} affected
                                          </span>
                                        )}
                                      </span>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setDeletingSubcategoryId(null)}
                                        className="h-8 px-3 text-sm"
                                      >
                                        Cancel
                                      </Button>
                                      <Button
                                        variant="destructive"
                                        size="sm"
                                        onClick={async () => {
                                          await deleteSubcategory(category.id, sub.id);
                                          await cascadeDelete([sub.name]);
                                          setDeletingSubcategoryId(null);
                                        }}
                                        className="h-8 px-3 text-sm"
                                      >
                                        Delete
                                      </Button>
                                    </div>
                                  ) : null}
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setDeletingSubcategoryId(sub.id)}
                                    className="h-8 w-8 p-0 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity text-primary hover:text-primary"
                                    title="Delete subcategory"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              ) : (
                                <div className="h-8 w-8" />
                              )}
                            </div>
                            </div>
                          </div>
                        );
                      })}
                  {!category.isSystem && (
                    <button
                      className="lg:hidden flex items-center gap-2 w-full px-6 py-3 text-sm text-muted-foreground border-t"
                      onClick={() => handleAddSubcategory(category.id)}
                    >
                      <Plus className="h-4 w-4" />
                      Add subcategory
                    </button>
                  )}
                </div>
              </Card>
            );
          })}

          {systemCategory && (
            <Card className="shadow-none">
              <CardContent className="p-0">
                <div className="space-y-4">
                  {/* System Category Header */}
                  <div className="border-b py-2">
                    <div className="flex items-center justify-between gap-2 px-6 lg:px-8 min-h-[41px]">
                      <span className="font-semibold">{systemCategory.name}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleAddSubcategory(systemCategory.id)}
                        className="h-6 w-6 p-0"
                        title="Add Subcategory"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>

              {/* System Subcategories */}
              <div>
                {(systemCategory.subcategories || []).map((sub, index) => {
                  const isEditingName = editingNames[sub.id] !== undefined || !sub.name;
                  const displayName = isEditingName ? (editingNames[sub.id] ?? '') : sub.name;
                  const isLast = index === (systemCategory.subcategories || []).length - 1;

                  return (
                    <div key={sub.id} className={`flex items-center justify-between gap-2 min-h-[40px] group ${!isLast ? 'border-b' : ''} px-6 lg:px-8`}>
                      <div className="flex items-center gap-2 flex-1">
                        {isEditingName ? (
                          <Input
                            type="text"
                            value={displayName}
                            onChange={(e) => handleNameChange(sub.id, e.target.value)}
                            onBlur={() => handleNameBlur(sub.id, systemCategory.id)}
                            onKeyDown={(e) => handleNameKeyDown(e, sub.id, systemCategory.id)}
                            className="h-8 flex-1 max-w-[200px]"
                            autoFocus
                            placeholder="Subcategory name"
                          />
                        ) : (
                          <>
                            <span>{sub.name || 'New Subcategory'}</span>
                            {!sub.isSystem && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEditSubcategory(sub);
                                }}
                                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                      {!sub.isSystem && (
                        <div className="relative flex items-center">
                          {deletingSubcategoryId === sub.id ? (
                            <div className="delete-confirmation-popover absolute right-full mr-2 bg-popover border rounded-md shadow-lg p-3 flex items-center gap-3 whitespace-nowrap z-10">
                              <span className="text-sm">Are you sure?</span>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setDeletingSubcategoryId(null)}
                                className="h-8 px-3 text-sm"
                              >
                                Cancel
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={async () => {
                                  await deleteSubcategory(systemCategory.id, sub.id);
                                  await cascadeDelete([sub.name]);
                                  setDeletingSubcategoryId(null);
                                }}
                                className="h-8 px-3 text-sm"
                              >
                                Delete
                              </Button>
                            </div>
                          ) : null}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeletingSubcategoryId(sub.id)}
                            className="h-6 w-6 p-0 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity text-primary hover:text-primary"
                            title="Delete subcategory"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </div>

        <ResponsiveDialog open={isModalOpen} onOpenChange={(open) => {
          setIsModalOpen(open);
          if (!open) {
            setShowDeleteConfirmation(false);
            setNameError('');
          }
        }}>
          <ResponsiveDialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingCategory?.category ? 'Edit Category' :
                 editingCategory?.subcategory ? 'Edit Sub-Category' :
                 editingCategory?.parentId ? 'Add Sub-Category' :
                 'Add Category'}
              </DialogTitle>
              <DialogDescription>
                {editingCategory?.subcategory || editingCategory?.parentId
                  ? 'Enter the subcategory name and budget amount.'
                  : 'Enter the category name.'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => {
                    setFormData({ ...formData, name: e.target.value });
                    // Clear error when user starts typing
                    if (nameError) {
                      setNameError('');
                    }
                  }}
                  placeholder="Enter name"
                  className={nameError ? 'border-destructive' : ''}
                />
                {nameError && (
                  <p className="text-sm text-destructive">{nameError}</p>
                )}
              </div>
              {(editingCategory?.subcategory || editingCategory?.parentId) && (
                <div className="space-y-2">
                  <Label htmlFor="amount">Amount</Label>
                  <AmountInput
                    id="amount"
                    value={modalAmount}
                    onChange={setModalAmount}
                    className="h-8 w-[120px] text-right"
                  />
                </div>
              )}
              {!editingCategory?.subcategory && !editingCategory?.parentId && (
                <div className="space-y-2">
                  <Label>Type</Label>
                  <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="Category type">
                    {(['flexible', 'fixed'] as const).map(kind => (
                      <Button
                        key={kind}
                        type="button"
                        variant={modalKind === kind ? 'default' : 'ghost'}
                        size="sm"
                        aria-pressed={modalKind === kind}
                        onClick={() => setModalKind(kind)}
                        className="capitalize"
                      >
                        {kind}
                      </Button>
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {modalKind === 'fixed'
                      ? 'Recurring bill — summarised as "bills paid" on the dashboard.'
                      : 'Variable spending — paced day by day on the dashboard.'}
                  </p>
                </div>
              )}
            </div>
            <DialogFooter>
              <div className="flex items-center justify-between w-full">
                <div>
                  {editingCategory && (editingCategory.category || editingCategory.subcategory) && (
                    showDeleteConfirmation ? (
                      <div className="flex items-center gap-2">
                        <span className="text-sm">
                          Are you sure?
                          {(() => {
                            const affected = countAffected(
                              editingCategory?.category
                                ? [
                                    editingCategory.category.name,
                                    ...(editingCategory.category.subcategories || []).map(sub => sub.name),
                                  ]
                                : [editingCategory?.subcategory?.name ?? '']
                            );
                            return affected > 0 ? (
                              <span className="text-muted-foreground">
                                {' '}{affected} transaction{affected === 1 ? '' : 's'} affected
                              </span>
                            ) : null;
                          })()}
                        </span>
                        <div className="flex gap-2">
                          <Button variant="outline" onClick={handleDeleteCancel}>
                            Cancel
                          </Button>
                          <Button variant="destructive" onClick={handleDeleteConfirm}>
                            Delete
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button variant="outline" onClick={handleDeleteClick}>
                        Delete
                      </Button>
                    )
                  )}
                </div>
                {!showDeleteConfirmation && (
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setIsModalOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleSave}>Save</Button>
                  </div>
                )}
              </div>
            </DialogFooter>
          </ResponsiveDialogContent>
        </ResponsiveDialog>

        <Sheet open={!!mobileSheet} onOpenChange={(open) => {
          if (!open) {
            setMobileSheet(null);
            setMobileSheetDeleteConfirm(false);
          }
        }}>
          <SheetContent side="bottom" className="lg:hidden rounded-t-xl" overlayClassName="bg-black/40 pointer-events-auto">
            <SheetHeader className="text-left mb-4">
              <SheetTitle>
                {mobileSheet?.type === 'subcategory' ? mobileSheet.sub?.name : mobileSheet?.category?.name}
              </SheetTitle>
              <SheetDescription className="sr-only">Edit category details</SheetDescription>
            </SheetHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="mobile-name">Name</Label>
                <Input
                  id="mobile-name"
                  value={mobileSheetName}
                  onChange={(e) => setMobileSheetName(e.target.value)}
                  placeholder="Enter name"
                />
              </div>
              {(mobileSheet?.type === 'subcategory' || (mobileSheet?.type === 'category' && !(mobileSheet.category?.subcategories || []).length)) && (
                <div className="space-y-2">
                  <Label htmlFor="mobile-amount">Budget</Label>
                  <AmountInput
                    id="mobile-amount"
                    value={mobileSheetAmount}
                    onChange={setMobileSheetAmount}
                    className="text-right w-[140px]"
                  />
                </div>
              )}
              {mobileSheet?.type === 'subcategory' && regularCategories.length > 1 && (
                <div className="space-y-2">
                  <Label htmlFor="mobile-category">Category</Label>
                  <Select
                    value={mobileSheetParentId != null ? String(mobileSheetParentId) : undefined}
                    onValueChange={(value) => setMobileSheetParentId(Number(value))}
                  >
                    <SelectTrigger id="mobile-category">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {regularCategories.map(cat => (
                        <SelectItem key={cat.id} value={String(cat.id)}>{cat.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {mobileSheet?.type === 'category' && (
                <div className="space-y-2">
                  <Label>Type</Label>
                  <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="Category type">
                    {(['flexible', 'fixed'] as const).map(kind => (
                      <Button
                        key={kind}
                        type="button"
                        variant={mobileSheetKind === kind ? 'default' : 'ghost'}
                        size="sm"
                        aria-pressed={mobileSheetKind === kind}
                        onClick={() => setMobileSheetKind(kind)}
                        className="capitalize"
                      >
                        {kind}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              <Button
                variant="outline"
                className="w-full justify-between"
                onClick={() => {
                  const name = mobileSheet?.type === 'subcategory'
                    ? mobileSheet.sub?.name
                    : mobileSheet?.category?.name;
                  if (name) navigate(`/transactions?category=${encodeURIComponent(name)}`);
                  setMobileSheet(null);
                }}
              >
                View Transactions
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-6">
              {mobileSheetDeleteConfirm ? (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground text-center">
                    Are you sure you want to delete this?
                    {mobileSheetAffectedCount > 0 && (
                      <>
                        {' '}
                        {mobileSheetAffectedCount} transaction
                        {mobileSheetAffectedCount === 1 ? '' : 's'} will become uncategorized.
                      </>
                    )}
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={() => setMobileSheetDeleteConfirm(false)}>
                      Cancel
                    </Button>
                    <Button variant="destructive" className="flex-1" onClick={handleMobileSheetDelete}>
                      Delete
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setMobileSheetDeleteConfirm(true)}>
                    Delete
                  </Button>
                  <Button className="flex-1" onClick={handleMobileSheetSave}>
                    Save
                  </Button>
                </div>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </Layout>
  );
}

