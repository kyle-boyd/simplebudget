import { useCallback, useRef, useState, useEffect } from 'react';
import { ref, onValue, set } from 'firebase/database';
import { db } from '@/lib/firebase';

export interface Subcategory {
  id: number;
  name: string;
  amount: number;
  isSystem?: boolean;
}

export interface Category {
  id: number;
  name: string;
  amount?: number;
  subcategories: Subcategory[];
  isSystem?: boolean;
  /**
   * Fixed categories are recurring bills (rent, insurance, car payment): their
   * spend is predictable and lands in a lump, so pacing a daily burn-up against
   * them is meaningless. The Dashboard puts flexible spending in the hero/cards
   * and summarises fixed ones as "bills paid". Missing means flexible — see
   * `isFixedCategory` — so nothing silently drops off the hero.
   */
  kind?: 'fixed' | 'flexible';
}

/** A category counts as fixed only when explicitly marked; everything else is flexible. */
export function isFixedCategory(category: Category): boolean {
  return category.kind === 'fixed';
}

/**
 * Realtime Database stores arrays as index-keyed objects and hands them back as
 * arrays only when the keys are contiguous. A list that ever lost an entry
 * comes back as an object, so coerce before treating it as a list.
 */
function toArray<T>(value: unknown): T[] {
  if (!value) return [];
  const items = Array.isArray(value) ? value : Object.values(value as Record<string, T>);
  return items.filter(Boolean) as T[];
}

const defaultCategories: Category[] = [
  { id: 1, name: "Hide from Budget", isSystem: true, subcategories: [{ id: 11, name: "Hide from Budget", isSystem: true, amount: 0 }] },
  { id: 2, name: "Housing", subcategories: [{ id: 21, name: "Rent/Mortgage", amount: 0 }, { id: 22, name: "Utilities", amount: 0 }, { id: 23, name: "Insurance", amount: 0 }] },
  { id: 3, name: "Transportation", subcategories: [{ id: 31, name: "Car Payment", amount: 0 }, { id: 32, name: "Gas", amount: 0 }, { id: 33, name: "Maintenance", amount: 0 }] },
  { id: 4, name: "Food", subcategories: [{ id: 41, name: "Groceries", amount: 0 }, { id: 42, name: "Restaurants", amount: 0 }] }
];

export function useCategories(userId: string | null) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const seededRef = useRef(false);

  useEffect(() => {
    seededRef.current = false;

    if (!userId) {
      setCategories([]);
      setLoading(false);
      return;
    }

    const categoriesRef = ref(db, `users/${userId}/categories`);

    const unsubscribe = onValue(categoriesRef, (snapshot) => {
      if (snapshot.exists()) {
        setCategories(
          toArray<Category>(snapshot.val())
            .map(category => ({
              ...category,
              subcategories: toArray<Subcategory>(category.subcategories),
            }))
        );
      } else if (!seededRef.current) {
        // Seed the defaults once; the write echoes back through this listener.
        seededRef.current = true;
        setCategories(defaultCategories);
        void set(categoriesRef, defaultCategories);
      } else {
        setCategories([]);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [userId]);

  const saveCategories = useCallback(async (newCategories: Category[]) => {
    if (!userId) return;
    await set(ref(db, `users/${userId}/categories`), newCategories);
  }, [userId]);

  const addCategory = async (category: Category) => {
    await saveCategories([...categories, category]);
  };

  const updateCategory = async (categoryId: number, updates: Partial<Category>) => {
    const updated = categories.map(c => 
      c.id === categoryId ? { ...c, ...updates } : c
    );
    await saveCategories(updated);
  };

  const deleteCategory = async (categoryId: number) => {
    const updated = categories.filter(c => c.id !== categoryId);
    await saveCategories(updated);
  };

  const addSubcategory = async (categoryId: number, subcategory: Subcategory) => {
    const updated = categories.map(c => 
      c.id === categoryId 
        ? { ...c, subcategories: [...(c.subcategories || []), subcategory] }
        : c
    );
    await saveCategories(updated);
  };

  const updateSubcategory = async (categoryId: number, subcategoryId: number, updates: Partial<Subcategory>) => {
    const updated = categories.map(c => 
      c.id === categoryId
        ? {
            ...c,
            subcategories: (c.subcategories || []).map(s =>
              s.id === subcategoryId ? { ...s, ...updates } : s
            )
          }
        : c
    );
    await saveCategories(updated);
  };

  const deleteSubcategory = async (categoryId: number, subcategoryId: number) => {
    const updated = categories.map(c =>
      c.id === categoryId
        ? { ...c, subcategories: (c.subcategories || []).filter(s => s.id !== subcategoryId) }
        : c
    );
    await saveCategories(updated);
  };

  /**
   * Reparent a subcategory. Transactions, rules and mappings reference a
   * subcategory by *name*, and the name is unchanged by the move, so this needs
   * no cascade — only which parent it rolls up under changes. Optional `updates`
   * (e.g. a simultaneous rename/amount edit) are applied in the *same* write:
   * `saveCategories` rewrites the whole list from this render's snapshot, so a
   * separate `updateSubcategory` call afterwards would read the stale list and
   * clobber the move.
   */
  const moveSubcategory = async (
    fromCategoryId: number,
    toCategoryId: number,
    subcategoryId: number,
    updates: Partial<Subcategory> = {}
  ) => {
    if (fromCategoryId === toCategoryId) {
      if (Object.keys(updates).length > 0) {
        await updateSubcategory(fromCategoryId, subcategoryId, updates);
      }
      return;
    }

    const source = categories.find(c => c.id === fromCategoryId);
    const moved = (source?.subcategories || []).find(s => s.id === subcategoryId);
    if (!moved) return;
    const movedWithUpdates = { ...moved, ...updates };

    const updated = categories.map(c => {
      if (c.id === fromCategoryId) {
        return { ...c, subcategories: (c.subcategories || []).filter(s => s.id !== subcategoryId) };
      }
      if (c.id === toCategoryId) {
        return { ...c, subcategories: [...(c.subcategories || []), movedWithUpdates] };
      }
      return c;
    });
    await saveCategories(updated);
  };

  return {
    categories,
    loading,
    saveCategories,
    addCategory,
    updateCategory,
    deleteCategory,
    addSubcategory,
    updateSubcategory,
    deleteSubcategory,
    moveSubcategory,
  };
}


