import { useState, useEffect } from 'react';
import { ref, onValue, set, get } from 'firebase/database';
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
  subcategories: Subcategory[];
  isSystem?: boolean;
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

  useEffect(() => {
    if (!userId) {
      setCategories([]);
      setLoading(false);
      return;
    }

    const categoriesRef = ref(db, `users/${userId}/categories`);
    
    const unsubscribe = onValue(categoriesRef, async (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const categoriesArray = Array.isArray(data) ? data : Object.values(data);
        // Normalize categories to ensure they all have subcategories array
        const normalizedCategories = (categoriesArray as Category[]).map(cat => ({
          ...cat,
          subcategories: cat.subcategories || []
        }));
        setCategories(normalizedCategories);
      } else {
        // Initialize with default categories if none exist
        await set(categoriesRef, defaultCategories);
        setCategories(defaultCategories);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [userId]);

  const saveCategories = async (newCategories: Category[]) => {
    if (!userId) return;
    
    const categoriesRef = ref(db, `users/${userId}/categories`);
    await set(categoriesRef, newCategories);
  };

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


