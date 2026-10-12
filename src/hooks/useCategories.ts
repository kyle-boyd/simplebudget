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
  };
}


