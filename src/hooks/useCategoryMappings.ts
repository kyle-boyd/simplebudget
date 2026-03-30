import { useState, useEffect } from 'react';
import { ref, onValue, set } from 'firebase/database';
import { db } from '@/lib/firebase';

// Maps importedCategory (e.g. "food_and_drink") → budget subcategory name (e.g. "Groceries")
export function useCategoryMappings(userId: string | null) {
  const [mappings, setMappings] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!userId) {
      setMappings({});
      return;
    }
    const mappingsRef = ref(db, `users/${userId}/categoryMappings`);
    const unsubscribe = onValue(mappingsRef, (snapshot) => {
      setMappings(snapshot.exists() ? (snapshot.val() as Record<string, string>) : {});
    });
    return () => unsubscribe();
  }, [userId]);

  const addMapping = async (importedCategory: string, budgetCategory: string) => {
    if (!userId) return;
    const newMappings = { ...mappings, [importedCategory]: budgetCategory };
    await set(ref(db, `users/${userId}/categoryMappings`), newMappings);
  };

  const deleteMapping = async (importedCategory: string) => {
    if (!userId) return;
    const newMappings = { ...mappings };
    delete newMappings[importedCategory];
    await set(
      ref(db, `users/${userId}/categoryMappings`),
      Object.keys(newMappings).length ? newMappings : null
    );
  };

  return { mappings, addMapping, deleteMapping };
}
