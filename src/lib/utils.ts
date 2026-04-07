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

/**
 * Smart date parser that handles various date formats and normalizes to MM/DD/YY format
 * Supports: MM/DD/YY, MM/DD/YYYY, M/D/YY, M/D/YYYY, YYYY-MM-DD, MM-DD-YYYY, etc.
 */
export function parseDate(dateString: string | number | Date): string {
  if (!dateString) return '';
  
  // If it's already a Date object, convert it
  if (dateString instanceof Date) {
    const month = String(dateString.getMonth() + 1).padStart(2, '0');
    const day = String(dateString.getDate()).padStart(2, '0');
    const year = String(dateString.getFullYear()).slice(-2);
    return `${month}/${day}/${year}`;
  }

  const str = String(dateString).trim();
  if (!str) return '';

  // Try to parse as a date - JavaScript Date constructor is quite flexible
  let date: Date | null = null;

  // Skip direct Date constructor for ISO format dates to avoid timezone issues
  // ISO dates like "2026-04-02" get parsed as UTC, but we want local date
  if (!/^\d{4}-\d{1,2}-\d{1,2}$/.test(str)) {
    const directDate = new Date(str);
    if (!isNaN(directDate.getTime())) {
      date = directDate;
    }
  }
  
  // If that didn't work, try common patterns
  if (!date) {
    // Handle MM/DD/YY or MM/DD/YYYY
    const slashMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (slashMatch) {
      const [, month, day, year] = slashMatch;
      // If 2-digit year, always assume 20xx (matching system convention)
      // If 4-digit year, use as-is
      const normalizedYear = year.length === 2 
        ? 2000 + parseInt(year)
        : parseInt(year);
      date = new Date(normalizedYear, parseInt(month) - 1, parseInt(day));
    }
  }
  
  if (!date) {
    // Handle YYYY-MM-DD (ISO format)
    const isoMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (isoMatch) {
      const [, year, month, day] = isoMatch;
      // Use local date constructor to avoid timezone issues
      date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    }
  }
  
  if (!date) {
    // Handle MM-DD-YYYY or MM-DD-YY
    const dashMatch = str.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
    if (dashMatch) {
      const [, month, day, year] = dashMatch;
      // If 2-digit year, always assume 20xx (matching system convention)
      const normalizedYear = year.length === 2 
        ? 2000 + parseInt(year)
        : parseInt(year);
      date = new Date(normalizedYear, parseInt(month) - 1, parseInt(day));
    }
  }
  
  if (!date) {
    // Try parsing as timestamp (milliseconds or seconds)
    const timestamp = /^\d+$/.test(str);
    if (timestamp) {
      const num = parseInt(str);
      // If it's 10 digits, assume seconds; if 13+, assume milliseconds
      date = new Date(num < 10000000000 ? num * 1000 : num);
    }
  }

  // If we still couldn't parse it, return the original string
  if (!date || isNaN(date.getTime())) {
    return str;
  }

  // Normalize to MM/DD/YY format
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);
  return `${month}/${day}/${year}`;
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

/**
 * Detects if a CSV column name is likely to be a category column
 */
export function detectCategoryColumn(columnName: string): number {
  const normalized = columnName.toLowerCase().trim();
  const categoryKeywords = [
    'category', 'cat', 'categories',
    'type', 'types',
    'classification', 'class',
    'tag', 'tags',
    'label', 'labels',
    'group', 'groups'
  ];
  
  // Check for exact matches
  if (categoryKeywords.includes(normalized)) {
    return 100; // High confidence
  }
  
  // Check for partial matches
  for (const keyword of categoryKeywords) {
    if (normalized.includes(keyword)) {
      return 50; // Medium confidence
    }
  }
  
  return 0; // No match
}

/**
 * Detects if a CSV column name is likely to be a date column
 */
export function detectDateColumn(columnName: string): number {
  const normalized = columnName.toLowerCase().trim();
  const dateKeywords = ['date', 'dates', 'transaction date', 'posting date', 'posted date', 'time'];
  
  if (dateKeywords.includes(normalized)) {
    return 100;
  }
  
  for (const keyword of dateKeywords) {
    if (normalized.includes(keyword)) {
      return 50;
    }
  }
  
  return 0;
}

/**
 * Detects if a CSV column name is likely to be an amount column
 */
export function detectAmountColumn(columnName: string): number {
  const normalized = columnName.toLowerCase().trim();
  const amountKeywords = [
    'amount', 'amt', 'value', 'transaction amount',
    'debit', 'credit', 'balance', 'total', 'sum'
  ];
  
  if (amountKeywords.includes(normalized)) {
    return 100;
  }
  
  for (const keyword of amountKeywords) {
    if (normalized.includes(keyword)) {
      return 50;
    }
  }
  
  return 0;
}

/**
 * Detects if a CSV column name is likely to be a description column
 */
export function detectDescriptionColumn(columnName: string): number {
  const normalized = columnName.toLowerCase().trim();
  const descriptionKeywords = [
    'description', 'desc', 'memo', 'note', 'notes',
    'details', 'detail', 'merchant', 'payee', 'vendor',
    'transaction description', 'narration', 'reference'
  ];
  
  if (descriptionKeywords.includes(normalized)) {
    return 100;
  }
  
  for (const keyword of descriptionKeywords) {
    if (normalized.includes(keyword)) {
      return 50;
    }
  }
  
  return 0;
}

/**
 * Scores how well CSV category values match existing subcategories
 * Returns a score from 0-100 indicating match quality
 */
export function scoreCategoryMatch(
  csvValues: (string | number | null | undefined)[],
  existingSubcategories: string[]
): number {
  if (csvValues.length === 0 || existingSubcategories.length === 0) {
    return 0;
  }

  // Normalize existing subcategories for comparison
  const normalizedExisting = new Set(
    existingSubcategories.map(cat => cat.toLowerCase().trim())
  );

  // Count how many CSV values match existing categories
  let matchCount = 0;
  let validCount = 0;

  for (const value of csvValues) {
    if (!value) continue;
    
    const normalizedValue = String(value).toLowerCase().trim();
    if (!normalizedValue) continue;

    validCount++;
    
    // Exact match
    if (normalizedExisting.has(normalizedValue)) {
      matchCount++;
      continue;
    }
    
    // Check for partial matches (e.g., "Groceries" matches "Groceries")
    for (const existing of normalizedExisting) {
      if (normalizedValue === existing || 
          normalizedValue.includes(existing) || 
          existing.includes(normalizedValue)) {
        matchCount++;
        break;
      }
    }
  }

  if (validCount === 0) return 0;
  
  // Return percentage of matches
  return Math.round((matchCount / validCount) * 100);
}


