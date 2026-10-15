#!/usr/bin/env node
/**
 * Repairs transactions imported before the CSV category column was routed to
 * `importedCategory`.
 *
 * The importer used to write the CSV's own category straight into `Category`.
 * That had two effects: `categorize()` skips rows that already have a Category,
 * so every rule was silently bypassed; and a foreign taxonomy label ("Shopping",
 * "Fast Food") ended up in Category, where it is not one of the user's
 * subcategories and so renders as invalid and drops out of budget totals.
 *
 * This moves the label to `importedCategory` and re-runs the real categoriser:
 * rules first, then the user's mappings, then the label itself if it happens to
 * already be one of their category names.
 *
 * Dry run by default. Imports the actual lib via esbuild rather than
 * reimplementing the matcher, so this can never drift from the app's behaviour.
 *
 *   node scripts/fix-imported-categories.mjs          # report
 *   node scripts/fix-imported-categories.mjs --yes    # apply
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const UID = process.env.SB_UID || 'VEi4HcUmOnXWYWquGc0sEFTpJus2';
const PROJECT = process.env.SB_PROJECT || 'simple-budgeting-5f9cb';
const DIR = path.join(os.homedir(), 'simplebudget-backups');
const commit = process.argv.includes('--yes');

const firebase = (args) =>
  execFileSync('npx', ['--no-install', 'firebase', ...args, '--project', PROJECT], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

// --- load the app's own categoriser -----------------------------------------
const bundle = path.join(os.tmpdir(), `sb-categorization-${process.pid}.mjs`);
execFileSync('node_modules/esbuild/bin/esbuild', [
  'src/lib/categorization.ts',
  '--bundle', '--format=esm', '--platform=node',
  `--outfile=${bundle}`,
  '--log-level=error',
]);
const { categorize } = await import(bundle);
fs.rmSync(bundle);

// --- read the live data ------------------------------------------------------
const read = (node) => JSON.parse(firebase(['database:get', `/users/${UID}/${node}`]) || 'null');
const toArray = (v) => (Array.isArray(v) ? v : Object.values(v || {})).filter(Boolean);

const transactions = toArray(read('transactions'));
const categories = toArray(read('categories'));
const mappings = read('categoryMappings') || {};
const storedRules = read('rules') || {};
const rules = Object.entries(storedRules).map(([id, rule]) => ({ ...rule, id }));

const subcategoryNames = categories.flatMap((category) =>
  toArray(category.subcategories).map((sub) => sub.name)
);
const valid = new Set(subcategoryNames);

if (transactions.length === 0) {
  console.log('no transactions to repair.');
  process.exit(0);
}

// --- move the foreign label aside, then re-categorise ------------------------
// Every row goes through this, not just the orphaned ones: a row whose label is
// already a real category name still deserves a chance to match a rule, and the
// name-match fallback restores the label when no rule applies.
const confirmed = transactions.filter((t) => t.confirmed).length;
const prepared = transactions.map((transaction) => {
  // Never touch a row the user has signed off on.
  if (transaction.confirmed) return transaction;
  const label = transaction.importedCategory || transaction.Category || '';
  const next = { ...transaction };
  if (label) next.importedCategory = label;
  next.Category = '';
  return next;
});

const repaired = categorize(prepared, rules, mappings, subcategoryNames);

// --- report ------------------------------------------------------------------
const count = (list, test) => list.filter(test).length;
const before = {
  valid: count(transactions, (t) => valid.has(t.Category)),
  orphan: count(transactions, (t) => t.Category && !valid.has(t.Category)),
  none: count(transactions, (t) => !t.Category),
  rule: count(transactions, (t) => t.hasRule),
  imported: count(transactions, (t) => t.importedCategory),
};
const after = {
  valid: count(repaired, (t) => valid.has(t.Category)),
  orphan: count(repaired, (t) => t.Category && !valid.has(t.Category)),
  none: count(repaired, (t) => !t.Category),
  rule: count(repaired, (t) => t.hasRule),
  suggested: count(repaired, (t) => t.suggestedCategory),
  imported: count(repaired, (t) => t.importedCategory),
};
const pad = (n) => String(n).padStart(6);
console.log(`transactions ${transactions.length}  rules ${rules.length}  categories ${valid.size}  confirmed ${confirmed} (left alone)\n`);
console.log('                        before   after');
console.log(`valid category        ${pad(before.valid)}  ${pad(after.valid)}`);
console.log(`ORPHANED category     ${pad(before.orphan)}  ${pad(after.orphan)}`);
console.log(`no category           ${pad(before.none)}  ${pad(after.none)}`);
console.log(`  of which suggested  ${pad(0)}  ${pad(after.suggested)}`);
console.log(`filed by a rule       ${pad(before.rule)}  ${pad(after.rule)}`);
console.log(`importedCategory kept ${pad(before.imported)}  ${pad(after.imported)}`);

if (after.orphan > 0) {
  console.error(`\nrefusing to write: ${after.orphan} row(s) would still hold an invalid category.`);
  process.exit(1);
}

if (!commit) {
  console.log('\ndry run - nothing written. re-run with --yes to apply.');
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
const backup = path.join(DIR, `sb-full-${stamp}-prefix.json`);
firebase(['database:get', `/users/${UID}`, '-o', backup]);
console.log(`\nbacked up to ${backup}`);

const tmp = path.join(os.tmpdir(), `sb-fixed-${process.pid}.json`);
fs.writeFileSync(tmp, JSON.stringify(repaired));
firebase(['database:set', `/users/${UID}/transactions`, tmp, '--force']);
fs.rmSync(tmp);
console.log(`rewrote ${repaired.length} transactions`);
