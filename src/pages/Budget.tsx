import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import { useCategories, Category, Subcategory } from '@/hooks/useCategories';
import { useTransactions } from '@/hooks/useTransactions';
import { formatCurrency } from '@/lib/utils';
import { Pencil, Plus, Trash2 } from 'lucide-react';

const SELECTED_MONTH_KEY = 'selectedMonth';

export function Budget() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { categories, addCategory, updateCategory, deleteCategory, addSubcategory, updateSubcategory, deleteSubcategory } = useCategories(user?.uid || null);
  const { transactions } = useTransactions(user?.uid || null);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    // Initialize from localStorage if available
    return localStorage.getItem(SELECTED_MONTH_KEY) || 'All Months';
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<{ category?: Category; subcategory?: Subcategory; parentId?: number } | null>(null);
  const [formData, setFormData] = useState({ name: '', amount: '' });
  const [editingAmounts, setEditingAmounts] = useState<{ [key: number]: string }>({});
  const [editingNames, setEditingNames] = useState<{ [key: number]: string }>({});
  const [modalAmountValue, setModalAmountValue] = useState<string>('');
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [deletingSubcategoryId, setDeletingSubcategoryId] = useState<number | null>(null);
  const [nameError, setNameError] = useState<string>('');

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

  // Get unique months from transactions
  const months = ['All Months', ...new Set(
    transactions.map(t => {
      const [month, , year] = t.Date.split('/');
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
        'July', 'August', 'September', 'October', 'November', 'December'];
      return `${monthNames[parseInt(month) - 1]}, 20${year}`;
    })
  )];

  // Filter transactions by selected month
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

  // Calculate spending for a subcategory
  const getSubcategorySpending = (subcategoryName: string): number => {
    return filteredTransactions
      .filter(t => t.Category?.trim() === subcategoryName.trim())
      .reduce((sum, t) => sum + Math.abs(t.Amount), 0);
  };

  // Calculate spending for a category (sum of all subcategories)
  const getCategorySpending = (category: Category): number => {
    return (category.subcategories || []).reduce((sum, sub) => {
      return sum + getSubcategorySpending(sub.name);
    }, 0);
  };

  const handleAddCategory = () => {
    setEditingCategory(null);
    setFormData({ name: '', amount: '' });
    setModalAmountValue('$0');
    setShowDeleteConfirmation(false);
    setNameError('');
    setIsModalOpen(true);
  };

  const handleEditCategory = (category: Category) => {
    if (category.isSystem) return;
    setEditingCategory({ category });
    setFormData({ name: category.name, amount: '' });
    setModalAmountValue('$0');
    setShowDeleteConfirmation(false);
    setNameError('');
    setIsModalOpen(true);
  };

  const handleEditSubcategory = (subcategory: Subcategory, parentId: number) => {
    if (subcategory.isSystem) return;
    // Put the name in edit mode
    setEditingNames({ ...editingNames, [subcategory.id]: subcategory.name });
  };

  const handleAmountChange = (subcategory: Subcategory, parentId: number, newAmount: string) => {
    // Remove $ and commas, then parse
    const cleanedValue = newAmount.replace(/[$,]/g, '');
    const amount = parseFloat(cleanedValue) || 0;
    updateSubcategory(parentId, subcategory.id, {
      name: subcategory.name,
      amount: amount,
    });
  };

  const formatAmountForInput = (amount: number | undefined): string => {
    if (amount === undefined || amount === null) return '$0';
    // Only show decimals if the amount has decimal places
    if (amount % 1 === 0) {
      return `$${amount.toFixed(0)}`;
    }
    return `$${amount.toFixed(2)}`;
  };

  const getInputValue = (sub: Subcategory): string => {
    if (editingAmounts[sub.id] !== undefined) {
      // Ensure $ is always present while editing
      const value = editingAmounts[sub.id];
      if (value.startsWith('$')) {
        return value;
      }
      return `$${value}`;
    }
    return formatAmountForInput(sub.amount);
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

  const handleNameChange = (subcategoryId: number, parentId: number, newName: string) => {
    setEditingNames({ ...editingNames, [subcategoryId]: newName });
  };

  const handleNameBlur = (subcategoryId: number, parentId: number) => {
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
    updateSubcategory(parentId, subcategoryId, {
      name: trimmedName,
      amount: subcategory.amount || 0,
    });

    // Clear editing state
    const newEditingNames = { ...editingNames };
    delete newEditingNames[subcategoryId];
    setEditingNames(newEditingNames);
  };

  const handleNameKeyDown = (e: React.KeyboardEvent, subcategoryId: number, parentId: number) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
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

  const handleSave = () => {
    if (!formData.name.trim()) return;

    const trimmedName = formData.name.trim();
    let hasDuplicate = false;

    // Check for duplicate category names across all categories
    const duplicateCategory = categories.find(
      c => {
        if (editingCategory?.category) {
          return c.id !== editingCategory.category.id && 
                 c.name.trim().toLowerCase() === trimmedName.toLowerCase();
        }
        return c.name.trim().toLowerCase() === trimmedName.toLowerCase();
      }
    );

    // Check for duplicate subcategory names across ALL categories
    const duplicateSubcategory = categories.some(c =>
      (c.subcategories || []).some(s => {
        if (editingCategory?.subcategory && editingCategory.parentId) {
          return s.id !== editingCategory.subcategory.id && 
                 s.name.trim().toLowerCase() === trimmedName.toLowerCase();
        }
        return s.name.trim().toLowerCase() === trimmedName.toLowerCase();
      })
    );

    if (editingCategory?.category) {
      // Editing a category - check if name conflicts with any category or subcategory
      if (duplicateCategory) {
        setNameError('A category with this name already exists');
        hasDuplicate = true;
      } else if (duplicateSubcategory) {
        setNameError('A subcategory with this name already exists');
        hasDuplicate = true;
      }
    } else if (editingCategory?.subcategory && editingCategory.parentId) {
      // Editing a subcategory - check if name conflicts with any category or subcategory
      if (duplicateCategory) {
        setNameError('A category with this name already exists');
        hasDuplicate = true;
      } else if (duplicateSubcategory) {
        setNameError('A subcategory with this name already exists');
        hasDuplicate = true;
      }
    } else if (editingCategory?.parentId) {
      // Adding a new subcategory - check if name conflicts with any category or subcategory
      if (duplicateCategory) {
        setNameError('A category with this name already exists');
        hasDuplicate = true;
      } else if (duplicateSubcategory) {
        setNameError('A subcategory with this name already exists');
        hasDuplicate = true;
      }
    } else {
      // Adding a new category - check if name conflicts with any category or subcategory
      if (duplicateCategory) {
        setNameError('A category with this name already exists');
        hasDuplicate = true;
      } else if (duplicateSubcategory) {
        setNameError('A subcategory with this name already exists');
        hasDuplicate = true;
      }
    }

    if (hasDuplicate) {
      return;
    }

    // Clear any previous errors
    setNameError('');

    if (editingCategory?.category) {
      // Update parent category
      updateCategory(editingCategory.category.id, { name: trimmedName });
    } else if (editingCategory?.subcategory && editingCategory.parentId) {
      // Update subcategory
      updateSubcategory(editingCategory.parentId, editingCategory.subcategory.id, {
        name: trimmedName,
        amount: parseFloat(formData.amount) || 0,
      });
    } else if (editingCategory?.parentId) {
      // Add new subcategory
      addSubcategory(editingCategory.parentId, {
        id: Date.now(),
        name: trimmedName,
        amount: parseFloat(formData.amount) || 0,
      });
    } else {
      // Add new parent category
      addCategory({
        id: Date.now(),
        name: trimmedName,
        subcategories: [],
      });
    }

    setIsModalOpen(false);
    setEditingCategory(null);
    setFormData({ name: '', amount: '' });
    setModalAmountValue('$0');
    setShowDeleteConfirmation(false);
    setNameError('');
  };

  const handleDeleteClick = () => {
    setShowDeleteConfirmation(true);
  };

  const handleDeleteCancel = () => {
    setShowDeleteConfirmation(false);
  };

  const handleDeleteConfirm = () => {
    if (!editingCategory) return;

    if (editingCategory.category) {
      deleteCategory(editingCategory.category.id);
    } else if (editingCategory.subcategory && editingCategory.parentId) {
      deleteSubcategory(editingCategory.parentId, editingCategory.subcategory.id);
    }

    setIsModalOpen(false);
    setEditingCategory(null);
    setFormData({ name: '', amount: '' });
    setModalAmountValue('$0');
    setShowDeleteConfirmation(false);
  };

  const regularCategories = categories.filter(cat => !cat.isSystem);
  const systemCategory = categories.find(cat => cat.isSystem);

  return (
    <Layout>
      <div className="space-y-6">
        <div className="sticky top-0 lg:top-0 z-10 h-auto lg:h-16 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 lg:gap-0 bg-background border-b -mx-4 lg:-mx-6 px-4 lg:px-6 py-4 lg:py-0">
          <h1 className="font-medium">Budget</h1>
          <div className="flex flex-col lg:flex-row gap-4 w-full lg:w-auto">
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
            <Button onClick={handleAddCategory} className="w-full lg:w-auto">
              + New Category
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          {regularCategories.map(category => {
            const totalAmount = (category.subcategories || []).reduce((sum, sub) => sum + (sub.amount || 0), 0);
            const categorySpending = getCategorySpending(category);
            const isOverBudget = categorySpending > totalAmount;
            return (
              <Card key={category.id} className="shadow-none">
                <CardContent className="p-0">
                  <div className="space-y-4">
                    {/* Category Header */}
                    <div className="border-b py-2">
                      <div className="flex items-center justify-between gap-2 group px-6 lg:px-8">
                      <div className="flex items-center gap-2 flex-1">
                        <span className="font-semibold">{category.name}</span>
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
                      <div className="flex items-center gap-16">
                        <div className="text-right">
                          <div className="text-sm text-muted-foreground">Budget</div>
                          <div className="font-semibold">{formatCurrency(totalAmount)}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-muted-foreground">Spent</div>
                          <div className={`font-semibold ${isOverBudget ? 'text-destructive' : 'text-green-600'}`}>
                            {formatCurrency(categorySpending)}
                          </div>
                        </div>
                        {!category.isSystem && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleAddSubcategory(category.id)}
                            className="h-8 w-8 p-0"
                            title="Add Subcategory"
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
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
                          <div key={sub.id} className={`flex items-center justify-between gap-2 py-1 group ${!isLast ? 'border-b' : ''} px-6 lg:px-8`}>
                            <div className="flex items-center gap-2 flex-1">
                              {isEditingName ? (
                                <Input
                                  type="text"
                                  value={displayName}
                                  onChange={(e) => handleNameChange(sub.id, category.id, e.target.value)}
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
                                        handleEditSubcategory(sub, category.id);
                                      }}
                                      className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                </>
                              )}
                            </div>
                            <div className="flex items-center gap-16">
                              <div className="text-right">
                                <Input
                                  type="text"
                                  value={getInputValue(sub)}
                                  onChange={(e) => {
                                    let value = e.target.value;
                                    // Ensure $ is always present
                                    if (!value.startsWith('$')) {
                                      // If user deleted $, add it back
                                      if (value === '' || /^\d/.test(value)) {
                                        value = '$' + value;
                                      }
                                    }
                                    // Store input while typing
                                    setEditingAmounts({ ...editingAmounts, [sub.id]: value });
                                  }}
                                  onBlur={(e) => {
                                    const cleanedValue = e.target.value.replace(/[$,]/g, '');
                                    const amount = parseFloat(cleanedValue) || 0;
                                    updateSubcategory(category.id, sub.id, {
                                      name: sub.name,
                                      amount: amount,
                                    });
                                    // Clear editing state and show formatted value
                                    const newEditingAmounts = { ...editingAmounts };
                                    delete newEditingAmounts[sub.id];
                                    setEditingAmounts(newEditingAmounts);
                                  }}
                                  onFocus={(e) => {
                                    // Show formatted value with $ when focused
                                    const amount = sub.amount || 0;
                                    if (amount % 1 === 0) {
                                      setEditingAmounts({ ...editingAmounts, [sub.id]: `$${amount.toFixed(0)}` });
                                    } else {
                                      setEditingAmounts({ ...editingAmounts, [sub.id]: `$${amount.toFixed(2)}` });
                                    }
                                  }}
                                  className="h-8 w-[120px] text-right"
                                />
                              </div>
                              <div className="text-right min-w-[100px]">
                                <div className={`font-medium ${isSubOverBudget ? 'text-destructive' : 'text-green-600'}`}>
                                  {formatCurrency(spending)}
                                </div>
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
                                        onClick={() => {
                                          deleteSubcategory(category.id, sub.id);
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
                                    className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-primary hover:text-primary"
                                    title="Delete subcategory"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                </div>
              </Card>
            );
          })}

          {systemCategory && (
            <Card className="shadow-none">
              <CardContent className="px-6 lg:px-8 py-4">
                <div className="space-y-2">
                  <div className="border-b">
                    <span className="font-semibold">{systemCategory.name}</span>
                  </div>
                  {(systemCategory.subcategories || []).map((sub) => (
                    <div key={sub.id} className="flex items-center justify-between py-1 border-b">
                      <span>{sub.name}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <Dialog open={isModalOpen} onOpenChange={(open) => {
          setIsModalOpen(open);
          if (!open) {
            setShowDeleteConfirmation(false);
            setNameError('');
          }
        }}>
          <DialogContent>
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
                  <Input
                    id="amount"
                    type="text"
                    value={modalAmountValue}
                    onChange={(e) => {
                      let value = e.target.value;
                      // Ensure $ is always present
                      if (!value.startsWith('$')) {
                        // If user deleted $, add it back
                        if (value === '' || /^\d/.test(value)) {
                          value = '$' + value;
                        }
                      }
                      setModalAmountValue(value);
                      // Also update formData for saving
                      const cleanedValue = value.replace(/[$,]/g, '');
                      setFormData({ ...formData, amount: cleanedValue });
                    }}
                    onBlur={(e) => {
                      const cleanedValue = e.target.value.replace(/[$,]/g, '');
                      const amount = parseFloat(cleanedValue) || 0;
                      if (amount % 1 === 0) {
                        setModalAmountValue(`$${amount.toFixed(0)}`);
                      } else {
                        setModalAmountValue(`$${amount.toFixed(2)}`);
                      }
                    }}
                    onFocus={(e) => {
                      // Show formatted value with $ when focused
                      const cleanedValue = modalAmountValue.replace(/[$,]/g, '');
                      const amount = parseFloat(cleanedValue) || 0;
                      if (amount % 1 === 0) {
                        setModalAmountValue(`$${amount.toFixed(0)}`);
                      } else {
                        setModalAmountValue(`$${amount.toFixed(2)}`);
                      }
                    }}
                    className="h-8 w-[120px] text-right"
                    placeholder="$0"
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <div className="flex items-center justify-between w-full">
                <div>
                  {editingCategory && (editingCategory.category || editingCategory.subcategory) && (
                    showDeleteConfirmation ? (
                      <div className="flex items-center gap-2">
                        <span className="text-sm">Are you sure?</span>
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
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}

