import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Utility functions migrated from utils.js
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount);
}

export function convertDate(dateString: string): string {
  const [month, day, year] = dateString.split('/');
  return `20${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

export function createTransactionId(transaction: { Date: string; Description: string; Amount: number | string }): string {
  const idString = `${transaction.Date}-${transaction.Description}-${transaction.Amount}`;
  
  let hash = 0;
  for (let i = 0; i < idString.length; i++) {
    const char = idString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  
  return Math.abs(hash).toString();
}


